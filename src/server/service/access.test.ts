import { describe, expect, it } from "vitest";
import * as svc from ".";
import type { Access } from "@/lib/types";
import { makeSpace, OWNER, setupTestDb } from "./test-helpers";

setupTestDb();

/**
 * A chat holding key A must never read, list, search, count or modify Space B,
 * and must get NotFound (not Forbidden) for B's items.
 */
describe("access isolation", () => {
  it("scopes every operation to the caller's Spaces", async () => {
    const A = await makeSpace("Alpha");
    const B = await makeSpace("Bravo");
    const chatA: Access = { actor: "chat-a", spaces: await svc.resolveKeys([A.space.key]) };
    expect(chatA.spaces).toEqual([A.space.id]);

    // Data in B
    const bTask = await svc.createTask(OWNER, {
      spaceId: B.space.id,
      title: "Secret zebra plan",
      acceptanceCriteria: ["x"],
      labels: ["waiting"],
    });
    const bChild = await svc.createTask(OWNER, { parent: bTask.ref, title: "Secret zebra child" });
    const bMs = await svc.createMilestone(OWNER, { spaceId: B.space.id, title: "Zebra launch" });
    const bDoc = await svc.createDocument(OWNER, { spaceId: B.space.id, title: "Zebra doc", body: "zebra body" });
    const bDec = await svc.createDecision(OWNER, { spaceId: B.space.id, title: "Zebra decision" });
    await svc.addComment(OWNER, bTask.ref, { body: "zebra comment" });
    // Data in A
    const aTask = await svc.createTask(chatA, { title: "Alpha zebra task" });
    expect(aTask.space.id).toBe(A.space.id);

    const nf = { code: "not_found" };

    // read
    await expect(svc.getTask(chatA, bTask.ref)).rejects.toMatchObject(nf);
    await expect(svc.getTask(chatA, bChild.ref)).rejects.toMatchObject(nf);
    await expect(svc.getMilestone(chatA, bMs.ref)).rejects.toMatchObject(nf);
    await expect(svc.getDocument(chatA, bDoc.ref)).rejects.toMatchObject(nf);
    await expect(svc.getDecision(chatA, bDec.ref)).rejects.toMatchObject(nf);
    await expect(svc.getSpace(chatA, B.space.id)).rejects.toMatchObject(nf);
    // the error for an existing B task is the same as for a ref that does not exist
    const missing = await svc.getTask(chatA, "T-99999").catch((e) => e);
    const hidden = await svc.getTask(chatA, bTask.ref).catch((e) => e);
    expect(hidden.constructor).toBe(missing.constructor);
    expect(hidden.status).toBe(404);

    // list (even when B is asked for explicitly)
    const listed = await svc.listTasks(chatA, { spaces: [B.space.id] });
    expect(listed.total).toBe(0);
    const all = await svc.listTasks(chatA, { includeArchived: true, drafts: "include" });
    expect(all.items.map((t) => t.ref)).toEqual([aTask.ref]);
    expect((await svc.listSpaces(chatA)).map((s) => s.id)).toEqual([A.space.id]);
    expect(await svc.listMilestones(chatA, { spaces: [B.space.id], includeArchived: true })).toEqual([]);
    expect(await svc.listDocuments(chatA, { spaces: [B.space.id] })).toEqual([]);
    expect(await svc.listDecisions(chatA)).toEqual([]);
    expect((await svc.listActivity(chatA)).items.every((a) => a.spaceId === A.space.id)).toBe(true);
    await expect(svc.listActivity(chatA, { spaceId: B.space.id })).rejects.toMatchObject(nf);
    expect((await svc.listActivity(chatA, { entityRef: bTask.ref })).items).toEqual([]);

    // search
    const found = await svc.search(chatA, "zebra");
    expect(found.map((r) => r.ref)).toEqual([aTask.ref]);
    expect(await svc.search(chatA, "zebra", { spaces: [B.space.id] })).toEqual([]);

    // count
    const stats = await svc.statistics(chatA);
    expect(stats.total).toBe(1);
    expect(stats.waiting).toEqual([]);
    const statsB = await svc.statistics(chatA, { spaces: [B.space.id] });
    expect(statsB.total).toBe(0);
    const counts = await svc.getNavCounts(chatA, { spaces: [B.space.id] });
    expect(counts).toEqual({ board: 0, tasks: 0, blocked: 0, drafts: 0, archive: 0, milestones: 0, documents: 0, decisions: 0 });
    expect(await svc.exportBoardMarkdown(chatA, { spaces: [B.space.id] })).not.toContain("zebra");

    // modify
    await expect(svc.updateTask(chatA, bTask.ref, { title: "pwned" })).rejects.toMatchObject(nf);
    await expect(svc.moveTask(chatA, { ref: bTask.ref, status: "Done" })).rejects.toMatchObject(nf);
    await expect(svc.moveTask(chatA, { ref: aTask.ref, beforeRef: bTask.ref })).rejects.toMatchObject(nf);
    await expect(svc.reorderTasks(chatA, { refs: [aTask.ref, bTask.ref] })).rejects.toMatchObject(nf);
    await expect(svc.archiveTask(chatA, bTask.ref)).rejects.toMatchObject(nf);
    await expect(svc.restoreTask(chatA, bTask.ref)).rejects.toMatchObject(nf);
    await expect(svc.deleteTask(chatA, bTask.ref)).rejects.toMatchObject(nf);
    await expect(svc.promoteDraft(chatA, bTask.ref)).rejects.toMatchObject(nf);
    await expect(svc.demoteTask(chatA, bTask.ref)).rejects.toMatchObject(nf);
    await expect(svc.addComment(chatA, bTask.ref, { body: "hi" })).rejects.toMatchObject(nf);
    await expect(svc.createTask(chatA, { parent: bTask.ref, title: "sneak" })).rejects.toMatchObject(nf);
    await expect(svc.createTask(chatA, { spaceId: B.space.id, title: "sneak" })).rejects.toMatchObject(nf);
    await expect(svc.updateTask(chatA, aTask.ref, { addDeps: [bTask.ref] })).rejects.toMatchObject(nf);
    await expect(svc.updateTask(chatA, aTask.ref, { spaceId: B.space.id })).rejects.toMatchObject(nf);
    await expect(svc.updateTask(chatA, aTask.ref, { milestone: bMs.ref })).rejects.toMatchObject(nf);
    await expect(svc.updateMilestone(chatA, bMs.ref, { title: "x" })).rejects.toMatchObject(nf);
    await expect(svc.archiveMilestone(chatA, bMs.ref)).rejects.toMatchObject(nf);
    await expect(svc.updateDocument(chatA, bDoc.ref, { body: "x" })).rejects.toMatchObject(nf);
    await expect(svc.archiveDocument(chatA, bDoc.ref)).rejects.toMatchObject(nf);
    await expect(svc.updateDecision(chatA, bDec.ref, { status: "accepted" })).rejects.toMatchObject(nf);
    await expect(svc.archiveDecision(chatA, bDec.ref)).rejects.toMatchObject(nf);
    await expect(svc.createMilestone(chatA, { spaceId: B.space.id, title: "x" })).rejects.toMatchObject(nf);
    await expect(svc.createDocument(chatA, { spaceId: B.space.id, title: "x" })).rejects.toMatchObject(nf);
    await expect(svc.createDecision(chatA, { spaceId: B.space.id, title: "x" })).rejects.toMatchObject(nf);
    await expect(svc.updateSpace(chatA, B.space.id, { name: "x" })).rejects.toMatchObject(nf);
    await expect(svc.regenerateKey(chatA, B.space.id)).rejects.toMatchObject(nf);
    await expect(svc.archiveSpace(chatA, B.space.id)).rejects.toMatchObject(nf);
    await expect(svc.cleanupDone(chatA, { olderThanDays: 0, spaces: [B.space.id] })).resolves.toEqual({ archived: [] });
    await expect(svc.updateSettings(chatA, { labels: [] })).rejects.toMatchObject({ code: "forbidden" });

    // B unchanged
    const b = await svc.getTask(OWNER, bTask.ref);
    expect(b.title).toBe("Secret zebra plan");
    expect(b.archivedAt).toBeNull();
    expect(b.comments.length).toBe(1);
  });

  it("a second key grants the second Space; a regenerated key stops working", async () => {
    const A = await makeSpace("Charlie");
    const B = await makeSpace("Delta");
    const t = await svc.createTask(OWNER, { spaceId: B.space.id, title: "shared later" });
    const both: Access = { actor: "chat", spaces: await svc.resolveKeys([A.space.key, B.space.key]) };
    expect((await svc.getTask(both, t.ref)).ref).toBe(t.ref);
    const regenerated = await svc.regenerateKey(OWNER, B.space.id);
    expect(regenerated.key).not.toBe(B.space.key);
    expect(await svc.resolveKeys([B.space.key])).toEqual([]);
    expect(await svc.resolveKeys([regenerated.key])).toEqual([B.space.id]);
    expect(await svc.resolveKeys(["garbage", ""])).toEqual([]);
  });

  it("a chat with no keys sees nothing", async () => {
    const none: Access = { actor: "chat", spaces: [] };
    expect((await svc.listTasks(none)).total).toBe(0);
    expect(await svc.listSpaces(none)).toEqual([]);
    expect(await svc.search(none, "zebra")).toEqual([]);
    expect((await svc.statistics(none)).total).toBe(0);
    expect((await svc.listActivity(none)).items).toEqual([]);
    await expect(svc.createTask(none, { title: "x" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("a chat can create a Space and gets its key", async () => {
    const chat: Access = { actor: "chat", spaces: [] };
    const sp = await svc.createSpace(chat, { name: "Chat made" });
    expect(sp.key).toMatch(/^sk_[a-z2-7]{32}$/);
    expect(sp.id).toMatch(/^sp_[a-z2-7]{10}$/);
    const holder: Access = { actor: "chat", spaces: [sp.id] };
    await expect(svc.createSpace(holder, { name: "chat MADE" })).rejects.toMatchObject({ code: "conflict" });
  });
});
