import { describe, expect, it } from "vitest";
import * as svc from "@/server/service";
import { makeSpace, OWNER, setupTestDb } from "./test-helpers";
import { imageSize, sniffImage } from "./attachments";

setupTestDb();

// 1×1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("status roles", () => {
  it("defaults: Blocked and Cancelled exist, Done is the done status, finished = Done + Cancelled", async () => {
    const s = await svc.getSettings(OWNER);
    expect(s.statuses).toEqual(["To Do", "In Progress", "Blocked", "Done", "Cancelled"]);
    expect(s.doneStatus).toBe("Done");
    expect(s.closedStatuses).toEqual(["Done", "Cancelled"]);
    expect(s.reasonStatuses).toEqual(["Blocked", "Cancelled"]);
    expect(s.stoppedStatuses).toEqual(["Blocked"]);
  });
});

describe("status reasons and trail", () => {
  it("needs a reason for Blocked/Cancelled, keeps every step with actor and reason", async () => {
    const { space, chat } = await makeSpace();
    const t = await svc.createTask(chat, { spaceId: space.id, title: "Export PDF" });
    expect(t.statusHistory).toHaveLength(1);
    expect(t.statusHistory[0]).toMatchObject({ from: null, to: "To Do", actor: "chat" });

    await expect(svc.updateTask(chat, t.ref, { status: "Blocked" })).rejects.toMatchObject({ code: "invalid" });
    await expect(svc.updateTask(chat, t.ref, { status: "Blocked", reason: "   " })).rejects.toMatchObject({ code: "invalid" });
    await expect(svc.moveTask(chat, { ref: t.ref, status: "Cancelled" })).rejects.toMatchObject({ code: "invalid" });

    let b = await svc.updateTask(chat, t.ref, { status: "Blocked", reason: "Waiting on: owner picks a library" });
    expect(b.status).toBe("Blocked");
    expect(b.statusReason).toBe("Waiting on: owner picks a library");

    // reason alone updates it and adds a trail step without a status change
    b = await svc.updateTask(chat, t.ref, { reason: "Waiting on: owner (asked twice)" });
    expect(b.statusReason).toBe("Waiting on: owner (asked twice)");
    // same reason again is a no-op
    const again = await svc.updateTask(chat, t.ref, { reason: "Waiting on: owner (asked twice)" });
    expect(again.statusHistory).toHaveLength(b.statusHistory.length);

    // unblocking clears the current reason (an optional reason is kept in the trail)
    const u = await svc.moveTask(chat, { ref: t.ref, status: "In Progress", reason: "Owner chose pdfkit" });
    expect(u.status).toBe("In Progress");
    expect(u.statusReason).toBe("Owner chose pdfkit");
    const plain = await svc.updateTask(chat, t.ref, { status: "Done" });
    expect(plain.statusReason).toBe("");

    const full = await svc.getTask(chat, t.ref);
    expect(full.statusHistory.map((e) => [e.from, e.to, e.reason])).toEqual([
      [null, "To Do", ""],
      ["To Do", "Blocked", "Waiting on: owner picks a library"],
      ["Blocked", "Blocked", "Waiting on: owner (asked twice)"],
      ["Blocked", "In Progress", "Owner chose pdfkit"],
      ["In Progress", "Done", ""],
    ]);
    const log = full.activity.find((a) => a.action === "status" && a.summary.includes("→ Blocked"));
    expect(log?.summary).toContain("Waiting on: owner picks a library");
  });

  it("creating straight into Blocked needs a reason; reorder into Cancelled too", async () => {
    const { space, chat } = await makeSpace();
    await expect(svc.createTask(chat, { spaceId: space.id, title: "x", status: "Blocked" })).rejects.toMatchObject({
      code: "invalid",
    });
    const t = await svc.createTask(chat, { spaceId: space.id, title: "x", status: "Blocked", reason: "No access yet" });
    expect(t.statusReason).toBe("No access yet");
    expect(t.statusHistory[0]).toMatchObject({ from: null, to: "Blocked", reason: "No access yet" });

    await expect(svc.reorderTasks(chat, { status: "Cancelled", refs: [t.ref] })).rejects.toMatchObject({ code: "invalid" });
    await svc.reorderTasks(chat, { status: "Cancelled", refs: [t.ref], reason: "Duplicate" });
    const c = await svc.getTask(chat, t.ref);
    expect(c.status).toBe("Cancelled");
    expect(c.statusReason).toBe("Duplicate");
  });

  it("parent progress counts Cancelled as finished; nav counts blocked; cleanup archives Cancelled", async () => {
    const { space, chat } = await makeSpace();
    const f = await svc.createTask(chat, { spaceId: space.id, title: "Feature", type: "feature" });
    const a = await svc.createTask(chat, { parent: f.ref, title: "a" });
    const b = await svc.createTask(chat, { parent: f.ref, title: "b" });
    const c = await svc.createTask(chat, { parent: f.ref, title: "c" });
    await svc.updateTask(chat, a.ref, { status: "Done" });
    await svc.updateTask(chat, b.ref, { status: "Cancelled", reason: "Not needed" });
    await svc.updateTask(chat, c.ref, { status: "Blocked", reason: "Waiting on design" });
    const parent = await svc.getTask(chat, f.ref);
    expect(parent.childDone).toBe(2);
    expect(parent.childTotal).toBe(3);
    expect(parent.childCounts.Blocked).toBe(1);

    const counts = await svc.getNavCounts(chat, { spaces: [space.id] });
    expect(counts.blocked).toBe(1);

    const stats = await svc.statistics(chat, { spaces: [space.id] });
    expect(stats.waiting.map((t) => t.ref)).toEqual([c.ref]);
    // completion leaves Cancelled out: 1 Done of 3 (feature + a + c)
    expect(stats.completion).toMatchObject({ done: 1, total: 3 });

    const cleaned = await svc.cleanupDone(chat, { olderThanDays: 0, spaces: [space.id] });
    expect(cleaned.archived.sort()).toEqual([a.ref, b.ref].sort());

    const md = await svc.exportBoardMarkdown(chat, { spaces: [space.id] });
    expect(md).toContain("Blocked: Waiting on design");
  });

  it("status renames follow into the trail and the roles", async () => {
    const { space, chat } = await makeSpace();
    const t = await svc.createTask(chat, { spaceId: space.id, title: "r", status: "Blocked", reason: "why" });
    const s = await svc.updateSettings(OWNER, {
      statuses: ["To Do", "In Progress", "On hold", "Done", "Cancelled"],
      renames: { statuses: [{ from: "Blocked", to: "On hold" }] },
    });
    expect(s.reasonStatuses).toEqual(["On hold", "Cancelled"]);
    expect(s.stoppedStatuses).toEqual(["On hold"]);
    const full = await svc.getTask(chat, t.ref);
    expect(full.status).toBe("On hold");
    expect(full.statusHistory[0].to).toBe("On hold");
    await expect(svc.updateSettings(OWNER, { doneStatus: "Nope" })).rejects.toMatchObject({ code: "invalid" });
    await expect(svc.updateSettings(OWNER, { reasonStatuses: ["To Do"] })).rejects.toMatchObject({ code: "invalid" });
    await svc.updateSettings(OWNER, {
      statuses: ["To Do", "In Progress", "Blocked", "Done", "Cancelled"],
      renames: { statuses: [{ from: "On hold", to: "Blocked" }] },
    });
  });

  it("hides another Space's tasks' trails (404)", async () => {
    const A = await makeSpace();
    const B = await makeSpace();
    const t = await svc.createTask(B.chat, { spaceId: B.space.id, title: "secret" });
    await expect(svc.getTask(A.chat, t.ref)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("attachments", () => {
  it("sniffs real image bytes and reads sizes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(imageSize(PNG, "image/png")).toEqual({ width: 1, height: 1 });
    expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(Buffer.from("GIF89a......"))).toBe("image/gif");
  });

  it("adds, lists, serves, captions and deletes, scoped to the caller's Spaces", async () => {
    const { space, chat } = await makeSpace();
    const other = await makeSpace();
    const t = await svc.createTask(chat, { spaceId: space.id, title: "with screenshot" });

    const a = await svc.addAttachment(chat, t.ref, { data: PNG, filename: "../../etc/passwd.png", caption: "Header overlap" });
    expect(a).toMatchObject({ contentType: "image/png", size: PNG.length, width: 1, height: 1, caption: "Header overlap" });
    expect(a.filename).not.toContain("/");
    expect(a.url).toBe(`/api/v1/tasks/${t.ref}/attachments/${a.id}`);

    const full = await svc.getTask(chat, t.ref);
    expect(full.attachments.map((x) => x.id)).toEqual([a.id]);
    expect(full.activity[0].action).toBe("attached");

    const file = await svc.getAttachmentFile(chat, t.ref, a.id);
    expect(Buffer.compare(file.data, PNG)).toBe(0);

    await expect(svc.getAttachmentFile(other.chat, t.ref, a.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.listAttachments(other.chat, t.ref)).rejects.toMatchObject({ code: "not_found" });
    // an id from another task does not resolve under this ref
    const t2 = await svc.createTask(chat, { spaceId: space.id, title: "other" });
    await expect(svc.getAttachmentFile(chat, t2.ref, a.id)).rejects.toMatchObject({ code: "not_found" });

    expect((await svc.updateAttachment(chat, t.ref, a.id, { caption: "Fixed caption" })).caption).toBe("Fixed caption");
    await svc.deleteAttachment(chat, t.ref, a.id);
    expect(await svc.listAttachments(chat, t.ref)).toEqual([]);
  });

  it("rejects non-images, empty files and files over 3 MB", async () => {
    const { space, chat } = await makeSpace();
    const t = await svc.createTask(chat, { spaceId: space.id, title: "bad files" });
    await expect(svc.addAttachment(chat, t.ref, { data: Buffer.from("<svg/>") })).rejects.toMatchObject({ code: "invalid" });
    await expect(svc.addAttachment(chat, t.ref, { data: new Uint8Array() })).rejects.toMatchObject({ code: "invalid" });
    const big = Buffer.alloc(3 * 1024 * 1024 + 1);
    PNG.copy(big);
    await expect(svc.addAttachment(chat, t.ref, { data: big })).rejects.toMatchObject({ code: "invalid" });
  });

  it("deleting the task removes its attachments", async () => {
    const { space, chat } = await makeSpace();
    const t = await svc.createTask(chat, { spaceId: space.id, title: "gone" });
    const a = await svc.addAttachment(chat, t.ref, { data: PNG });
    await svc.archiveTask(chat, t.ref);
    await svc.deleteTask(chat, t.ref);
    await expect(svc.getAttachmentFile(OWNER, t.ref, a.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
