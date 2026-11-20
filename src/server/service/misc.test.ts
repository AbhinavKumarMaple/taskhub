import { describe, expect, it } from "vitest";
import * as svc from ".";
import { weekStart } from "./statistics";
import { makeSpace, OWNER, setupTestDb } from "./test-helpers";

setupTestDb();

describe("settings", () => {
  it("renames migrate tasks; removing a value in use is a Conflict", async () => {
    const { space } = await makeSpace();
    const t = await svc.createTask(OWNER, { spaceId: space.id, title: "s", labels: ["waiting", "blocked"] });
    await svc.updateSettings(OWNER, { labels: ["waiting", "blocked"] });

    await expect(svc.updateSettings(OWNER, { statuses: ["Doing", "In Progress", "Done"] })).rejects.toMatchObject({
      code: "conflict",
    });
    const s = await svc.updateSettings(OWNER, {
      statuses: ["Backlog", "In Progress", "Done"],
      renames: { statuses: [{ from: "To Do", to: "Backlog" }] },
    });
    expect(s.statuses).toEqual(["Backlog", "In Progress", "Done"]);
    expect(s.defaultStatus).toBe("Backlog");
    expect((await svc.getTask(OWNER, t.ref)).status).toBe("Backlog");

    // label rename that merges into an existing label de-duplicates
    await svc.updateSettings(OWNER, { labels: ["waiting"], renames: { labels: [{ from: "blocked", to: "waiting" }] } });
    expect((await svc.getTask(OWNER, t.ref)).labels).toEqual(["waiting"]);

    await expect(svc.updateSettings(OWNER, { labels: [] })).rejects.toMatchObject({ code: "conflict" });
    await expect(
      svc.updateSettings(OWNER, { types: ["feature"], renames: { types: [{ from: "nope", to: "feature" }] } }),
    ).rejects.toMatchObject({ code: "invalid" });

    // restore defaults for the rest of the file
    await svc.updateSettings(OWNER, {
      statuses: ["To Do", "In Progress", "Blocked", "Done", "Cancelled"],
      renames: { statuses: [{ from: "Backlog", to: "To Do" }] },
      closedStatuses: ["Done", "Cancelled"],
      reasonStatuses: ["Blocked", "Cancelled"],
    });
    const log = await svc.listActivity(OWNER, { entityRef: "settings" });
    expect(log.items[0].entityType).toBe("settings");
    expect(log.items[0].changes.statuses).toBeTruthy();
  });
});

describe("search", () => {
  it("matches every word in any order and ranks title above body", async () => {
    const { space } = await makeSpace();
    const titleHit = await svc.createTask(OWNER, { spaceId: space.id, title: "Export invoices to spreadsheet" });
    const bodyHit = await svc.createTask(OWNER, {
      spaceId: space.id,
      title: "Monthly close",
      description: "We need the spreadsheet export of invoices here",
    });
    await svc.createTask(OWNER, { spaceId: space.id, title: "Invoices only" });
    const doc = await svc.createDocument(OWNER, { spaceId: space.id, title: "Spreadsheet notes", body: "invoices export rules" });
    const dec = await svc.createDecision(OWNER, { spaceId: space.id, title: "Use spreadsheet", context: "export invoices" });

    const a = await svc.search(OWNER, "spreadsheet invoices export", { spaces: [space.id] });
    const b = await svc.search(OWNER, "export INVOICES spreadsheet", { spaces: [space.id] });
    expect(a.map((r) => r.ref).sort()).toEqual([titleHit.ref, bodyHit.ref, doc.ref, dec.ref].sort());
    expect(b.map((r) => r.ref)).toEqual(a.map((r) => r.ref));
    expect(a[0].ref).toBe(titleHit.ref);
    const body = a.find((r) => r.ref === bodyHit.ref)!;
    expect(body.snippet).toContain("spreadsheet");

    expect((await svc.search(OWNER, titleHit.ref)).at(0)?.ref).toBe(titleHit.ref);
    const onlyDocs = await svc.search(OWNER, "spreadsheet", { types: ["document"], spaces: [space.id] });
    expect(onlyDocs.map((r) => r.kind)).toEqual(["document"]);
    expect(await svc.search(OWNER, "   ")).toEqual([]);
    // wildcards are literal
    expect(await svc.search(OWNER, "%", { spaces: [space.id] })).toEqual([]);
  });
});

describe("statistics", () => {
  it("counts by status/type/priority, completion, weekly, oldest open and waiting", async () => {
    const { space } = await makeSpace();
    const sp = { spaces: [space.id] };
    const a = await svc.createTask(OWNER, { spaceId: space.id, title: "a", priority: "High" });
    await svc.createTask(OWNER, { spaceId: space.id, title: "b", type: "fix", labels: ["waiting"] });
    await svc.createTask(OWNER, { spaceId: space.id, title: "c", status: "Done", type: "minor" });
    await svc.createTask(OWNER, { spaceId: space.id, title: "draft", isDraft: true });
    await svc.updateTask(OWNER, a.ref, { status: "Done" });
    const s = await svc.statistics(OWNER, sp);
    expect(s.total).toBe(3);
    expect(s.byStatus).toEqual([
      { name: "To Do", count: 1 },
      { name: "In Progress", count: 0 },
      { name: "Blocked", count: 0 },
      { name: "Done", count: 2 },
      { name: "Cancelled", count: 0 },
    ]);
    expect(s.byType.find((r) => r.name === "fix")?.count).toBe(1);
    expect(s.byPriority.find((r) => r.name === "High")?.count).toBe(1);
    expect(s.byPriority.find((r) => r.name === "None")?.count).toBe(2);
    expect(s.completion).toEqual({ done: 2, total: 3, percent: 67 });
    expect(s.weekly).toHaveLength(8);
    const last = s.weekly[7];
    expect(last.created).toBe(3);
    expect(last.completed).toBe(2);
    expect(s.waiting.map((t) => t.title)).toEqual(["b"]);
    expect(s.oldestOpen.map((t) => t.title)).toEqual(["b"]);
  });

  it("weekStart is Monday UTC", () => {
    expect(weekStart(new Date("2026-11-19T15:00:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(weekStart(new Date("2026-11-16T00:00:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(weekStart(new Date("2026-11-22T23:59:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });
});

describe("milestones, documents, decisions", () => {
  it("milestones: create with M- refs, progress, tasks, archive/restore/delete", async () => {
    const { space, chat } = await makeSpace();
    const m = await svc.createMilestone(chat, { title: "v1", dueDate: "2027-01-31" });
    expect(m.ref).toMatch(/^M-\d+$/);
    const t = await svc.createTask(chat, { title: "in m", milestone: m.ref });
    await svc.createTask(chat, { title: "done in m", milestone: m.ref, status: "Done" });
    expect(t.milestone).toEqual({ ref: m.ref, title: "v1" });
    const full = await svc.getMilestone(chat, m.ref);
    expect([full.taskDone, full.taskTotal]).toEqual([1, 2]);
    expect(full.tasks).toHaveLength(2);
    const u = await svc.updateMilestone(chat, m.ref, { title: "v1.0" });
    expect(u.title).toBe("v1.0");
    expect((await svc.listTasks(chat, { milestone: m.ref })).total).toBe(2);
    expect((await svc.listTasks(chat, { milestone: "none" })).total).toBe(0);
    await expect(svc.deleteMilestone(chat, m.ref)).rejects.toMatchObject({ code: "invalid" });
    await svc.archiveMilestone(chat, m.ref);
    expect(await svc.listMilestones(chat)).toEqual([]);
    expect((await svc.listMilestones(chat, { archivedOnly: true })).map((x) => x.ref)).toEqual([m.ref]);
    await svc.restoreMilestone(chat, m.ref);
    await svc.archiveMilestone(chat, m.ref);
    await svc.deleteMilestone(chat, m.ref);
    expect((await svc.getTask(chat, t.ref)).milestone).toBeNull();
    const m2 = await svc.createMilestone(OWNER, { spaceId: space.id, title: "v2" });
    expect(Number(m2.ref.slice(2))).toBe(Number(m.ref.slice(2)) + 1);
  });

  it("documents: DOC- refs, update diff, list q, archive/restore/delete", async () => {
    const { chat } = await makeSpace();
    const d = await svc.createDocument(chat, { title: "Guide", body: "# Hello" });
    expect(d.ref).toMatch(/^DOC-\d+$/);
    const u = await svc.updateDocument(chat, d.ref, { body: "# Hello world" });
    expect(u.body).toBe("# Hello world");
    const log = await svc.listActivity(chat, { entityRef: d.ref });
    expect(log.items[0].changes.body).toEqual({ from: "7 chars", to: "13 chars" });
    expect((await svc.listDocuments(chat, { q: "world hello" })).map((x) => x.ref)).toEqual([d.ref]);
    await svc.archiveDocument(chat, d.ref);
    expect(await svc.listDocuments(chat)).toEqual([]);
    await svc.restoreDocument(chat, d.ref);
    expect((await svc.listDocuments(chat)).length).toBe(1);
    await svc.archiveDocument(chat, d.ref);
    await svc.deleteDocument(chat, d.ref);
    await expect(svc.getDocument(chat, d.ref)).rejects.toMatchObject({ code: "not_found" });
  });

  it("decisions: DEC- refs, status changes logged as 'status', filter by status", async () => {
    const { chat } = await makeSpace();
    const d = await svc.createDecision(chat, { title: "Use Postgres", context: "need SQL" });
    expect(d.ref).toMatch(/^DEC-\d+$/);
    expect(d.status).toBe("proposed");
    const u = await svc.updateDecision(chat, d.ref, { status: "accepted", decision: "Postgres it is" });
    expect(u.status).toBe("accepted");
    const log = await svc.listActivity(chat, { entityRef: d.ref });
    expect(log.items[0].action).toBe("status");
    expect((await svc.listDecisions(chat, { status: "accepted" })).length).toBe(1);
    expect((await svc.listDecisions(chat, { status: "rejected" })).length).toBe(0);
    await expect(svc.updateDecision(chat, d.ref, { status: "maybe" as never })).rejects.toMatchObject({
      code: "invalid",
    });
    await svc.archiveDecision(chat, d.ref);
    await svc.restoreDecision(chat, d.ref);
    await svc.archiveDecision(chat, d.ref);
    await svc.deleteDecision(chat, d.ref);
  });
});

describe("spaces", () => {
  it("lists with counts, renames, archives (hidden from default task lists) and restores", async () => {
    const { space } = await makeSpace("Counting");
    await svc.createTask(OWNER, { spaceId: space.id, title: "open" });
    await svc.createTask(OWNER, { spaceId: space.id, title: "done", status: "Done" });
    await svc.createTask(OWNER, { spaceId: space.id, title: "idea", isDraft: true });
    const row = (await svc.listSpaces(OWNER)).find((s) => s.id === space.id)!;
    expect(row.counts).toMatchObject({ total: 2, open: 1, drafts: 1, archived: 0 });
    const renamed = await svc.updateSpace(OWNER, space.id, { name: "Counted", color: "green" });
    expect(renamed.name).toBe("Counted");
    await svc.archiveSpace(OWNER, space.id);
    expect((await svc.listSpaces(OWNER)).some((s) => s.id === space.id)).toBe(false);
    expect((await svc.listSpaces(OWNER, { includeArchived: true })).some((s) => s.id === space.id)).toBe(true);
    const all = await svc.listTasks(OWNER, { limit: 1000 });
    expect(all.items.some((t) => t.space.id === space.id)).toBe(false);
    expect((await svc.listTasks(OWNER, { spaces: [space.id] })).total).toBe(2);
    await svc.restoreSpace(OWNER, space.id);
    const log = await svc.listActivity(OWNER, { spaceId: space.id });
    expect(log.items.map((a) => a.action)).toContain("restored");
  });

  it("paginates activity with a before cursor and filters by actor", async () => {
    const { space } = await makeSpace();
    for (let i = 0; i < 5; i++)
      await svc.createTask({ actor: "pager", spaces: "all" }, { spaceId: space.id, title: `p${i}` });
    const p1 = await svc.listActivity(OWNER, { spaceId: space.id, actor: "pager", limit: 3 });
    expect(p1.items).toHaveLength(3);
    expect(p1.nextBefore).not.toBeNull();
    const p2 = await svc.listActivity(OWNER, { spaceId: space.id, actor: "pager", limit: 3, before: p1.nextBefore! });
    expect(p2.items).toHaveLength(2);
    expect(p2.nextBefore).toBeNull();
    expect(await svc.listActors(OWNER)).toContain("pager");
  });

  it("version changes on every write", async () => {
    const { space, chat } = await makeSpace();
    const v1 = await svc.getVersion(chat);
    await svc.createTask(OWNER, { spaceId: space.id, title: "bump" });
    const v2 = await svc.getVersion(chat);
    expect(v2).not.toBe(v1);
  });
});
