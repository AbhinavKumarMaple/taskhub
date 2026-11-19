import { describe, expect, it } from "vitest";
import {
  addComment,
  applyChecklistOps,
  archiveTask,
  cleanupDone,
  createTask,
  deleteTask,
  demoteTask,
  exportBoardMarkdown,
  getTask,
  listActivity,
  listTasks,
  moveTask,
  promoteDraft,
  reorderTasks,
  restoreTask,
  updateSettings,
  updateTask,
} from ".";
import { getDb } from "../db";
import { tasks } from "../db/schema";
import { eq } from "drizzle-orm";
import { makeSpace, OWNER, setupTestDb } from "./test-helpers";

setupTestDb();

describe("refs", () => {
  it("gives top-level tasks T-<n> from a global sequence and children <parent>.<k>", async () => {
    const { space: a } = await makeSpace();
    const { space: b } = await makeSpace();
    const t1 = await createTask(OWNER, { spaceId: a.id, title: "First" });
    const t2 = await createTask(OWNER, { spaceId: b.id, title: "Second" });
    const n1 = Number(t1.ref.slice(2));
    expect(t1.ref).toMatch(/^T-\d+$/);
    expect(t2.ref).toBe(`T-${n1 + 1}`);
    const c1 = await createTask(OWNER, { parent: t1.ref, title: "child 1" });
    const c2 = await createTask(OWNER, { parent: t1.ref, title: "child 2" });
    const gc = await createTask(OWNER, { parent: c2.ref, title: "grandchild" });
    expect(c1.ref).toBe(`${t1.ref}.1`);
    expect(c2.ref).toBe(`${t1.ref}.2`);
    expect(gc.ref).toBe(`${t1.ref}.2.1`);
    expect(c1.space.id).toBe(a.id);
    expect(c1.type).toBe("sub-feature");
    expect(c1.parentRef).toBe(t1.ref);
  });

  it("rejects a child in a different Space than its parent", async () => {
    const { space: a } = await makeSpace();
    const { space: b } = await makeSpace();
    const p = await createTask(OWNER, { spaceId: a.id, title: "P" });
    await expect(createTask(OWNER, { spaceId: b.id, parent: p.ref, title: "x" })).rejects.toThrow(/parent's Space/);
  });

  it("accepts lower-case refs", async () => {
    const { space } = await makeSpace();
    const t = await createTask(OWNER, { spaceId: space.id, title: "case" });
    const got = await getTask(OWNER, t.ref.toLowerCase());
    expect(got.ref).toBe(t.ref);
  });
});

describe("create", () => {
  it("sets defaults, ACs, DoD defaults and validates vocabulary", async () => {
    const { space } = await makeSpace();
    await updateSettings(OWNER, { dodDefaults: ["Tests pass"] });
    const t = await createTask(OWNER, {
      spaceId: space.id,
      title: "With lists",
      acceptanceCriteria: ["one", "two"],
      definitionOfDone: ["Docs updated"],
      labels: ["waiting", "waiting"],
      priority: "High",
    });
    expect(t.status).toBe("To Do");
    expect(t.type).toBe("feature");
    expect(t.labels).toEqual(["waiting"]);
    expect(t.acceptanceCriteria.map((i) => i.text)).toEqual(["one", "two"]);
    expect(t.definitionOfDone.map((i) => i.text)).toEqual(["Tests pass", "Docs updated"]);
    expect(t.acTotal).toBe(2);
    const noDod = await createTask(OWNER, { spaceId: space.id, title: "bare", noDodDefaults: true });
    expect(noDod.definitionOfDone).toEqual([]);
    await updateSettings(OWNER, { dodDefaults: [] });

    await expect(createTask(OWNER, { spaceId: space.id, title: "x", status: "Nope" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(createTask(OWNER, { spaceId: space.id, title: "" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("records a created activity row", async () => {
    const { space } = await makeSpace();
    const t = await createTask(OWNER, { spaceId: space.id, title: "Logged" });
    expect(t.activity[0].action).toBe("created");
    expect(t.activity[0].actor).toBe("owner");
    expect(t.activity[0].changes.title).toEqual({ from: null, to: "Logged" });
  });
});

describe("update", () => {
  it("diffs fields into activity and uses 'status' for status changes", async () => {
    const { space } = await makeSpace();
    const t = await createTask(OWNER, { spaceId: space.id, title: "Before" });
    const u = await updateTask(OWNER, t.ref, { title: "After", priority: "Low" });
    expect(u.title).toBe("After");
    expect(u.activity[0].action).toBe("updated");
    expect(u.activity[0].changes).toMatchObject({
      title: { from: "Before", to: "After" },
      priority: { from: null, to: "Low" },
    });
    const s = await updateTask(OWNER, t.ref, { status: "In Progress" });
    expect(s.activity[0].action).toBe("status");
    expect(s.activity[0].changes.status).toEqual({ from: "To Do", to: "In Progress" });
    // a no-op writes nothing
    const before = s.activity.length;
    const same = await updateTask(OWNER, t.ref, { title: "After" });
    expect(same.activity.length).toBe(before);
  });

  it("names fields in plain words in the activity summary", async () => {
    const { space } = await makeSpace();
    const t = await createTask(OWNER, { spaceId: space.id, title: "Summary words" });
    const u = await updateTask(OWNER, t.ref, { dueDate: "2027-01-20", finalSummary: "Done." });
    expect(u.activity[0].summary).toBe(`Updated ${t.ref} (due date, final summary)`);
  });

  it("supports every AC op and setAc keeps checks on identical text", async () => {
    const { space } = await makeSpace();
    const t = await createTask(OWNER, { spaceId: space.id, title: "AC", acceptanceCriteria: ["a", "b", "c"] });
    let u = await updateTask(OWNER, t.ref, { checkAc: [1, 3] });
    expect(u.acceptanceCriteria.map((i) => i.checked)).toEqual([true, false, true]);
    expect([u.acDone, u.acTotal]).toEqual([2, 3]);
    u = await updateTask(OWNER, t.ref, { uncheckAc: [3] });
    expect(u.acceptanceCriteria.map((i) => i.checked)).toEqual([true, false, false]);
    u = await updateTask(OWNER, t.ref, { editAc: [{ index: 2, text: "B" }] });
    expect(u.acceptanceCriteria.map((i) => i.text)).toEqual(["a", "B", "c"]);
    u = await updateTask(OWNER, t.ref, { addAc: ["d"] });
    expect(u.acceptanceCriteria.map((i) => i.text)).toEqual(["a", "B", "c", "d"]);
    u = await updateTask(OWNER, t.ref, { removeAc: [3] });
    expect(u.acceptanceCriteria.map((i) => i.text)).toEqual(["a", "B", "d"]);
    u = await updateTask(OWNER, t.ref, { reorderAc: [3, 1, 2] });
    expect(u.acceptanceCriteria.map((i) => i.text)).toEqual(["d", "a", "B"]);
    u = await updateTask(OWNER, t.ref, { setAc: ["a", "new", "d"] });
    expect(u.acceptanceCriteria.map((i) => [i.text, i.checked])).toEqual([
      ["a", true],
      ["new", false],
      ["d", false],
    ]);
    expect(u.activity[0].changes.acceptanceCriteria).toBeTruthy();
    await expect(updateTask(OWNER, t.ref, { checkAc: [9] })).rejects.toMatchObject({ code: "invalid" });
  });

  it("supports DoD ops, appendNotes/appendPlan, label add/remove", async () => {
    const { space } = await makeSpace();
    const t = await createTask(OWNER, { spaceId: space.id, title: "Misc", notes: "first", noDodDefaults: true });
    const u = await updateTask(OWNER, t.ref, {
      addDod: ["x", "y"],
      appendNotes: "second",
      appendPlan: "step 1",
      addLabels: ["waiting", "ui"],
    });
    expect(u.definitionOfDone.map((i) => i.text)).toEqual(["x", "y"]);
    expect(u.notes).toBe("first\n\nsecond");
    expect(u.plan).toBe("step 1");
    expect(u.labels).toEqual(["waiting", "ui"]);
    const v = await updateTask(OWNER, t.ref, { checkDod: [2], removeLabels: ["waiting"] });
    expect(v.definitionOfDone.map((i) => i.checked)).toEqual([false, true]);
    expect(v.labels).toEqual(["ui"]);
    const w = await updateTask(OWNER, t.ref, { setDod: ["y", "z"] });
    expect(w.definitionOfDone.map((i) => [i.text, i.checked])).toEqual([
      ["y", true],
      ["z", false],
    ]);
  });

  it("applyChecklistOps applies set, then index ops, then add", () => {
    const out = applyChecklistOps(
      [
        { text: "a", checked: true },
        { text: "b", checked: false },
      ],
      { set: ["b", "a", "c"], check: [3], remove: [1], add: ["d"] },
      "AC",
    );
    expect(out).toEqual([
      { text: "a", checked: true },
      { text: "c", checked: true },
      { text: "d", checked: false },
    ]);
  });

  it("moves a top-level task to another Space with its children", async () => {
    const { space: a } = await makeSpace();
    const { space: b } = await makeSpace();
    const p = await createTask(OWNER, { spaceId: a.id, title: "mover" });
    const c = await createTask(OWNER, { parent: p.ref, title: "kid" });
    const moved = await updateTask(OWNER, p.ref, { spaceId: b.id });
    expect(moved.space.id).toBe(b.id);
    expect((await getTask(OWNER, c.ref)).space.id).toBe(b.id);
    await expect(updateTask(OWNER, c.ref, { spaceId: a.id })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("dependencies", () => {
  it("adds deps both ways with transitive trees and rejects self and cycles", async () => {
    const { space } = await makeSpace();
    const a = await createTask(OWNER, { spaceId: space.id, title: "A" });
    const b = await createTask(OWNER, { spaceId: space.id, title: "B" });
    const c = await createTask(OWNER, { spaceId: space.id, title: "C", dependsOn: [b.ref] });
    await updateTask(OWNER, b.ref, { addDeps: [a.ref] });
    const full = await getTask(OWNER, c.ref);
    expect(full.dependsOn.map((d) => [d.ref, d.depth, d.via])).toEqual([
      [b.ref, 1, null],
      [a.ref, 2, b.ref],
    ]);
    const blocks = await getTask(OWNER, a.ref);
    expect(blocks.blocks.map((d) => [d.ref, d.depth])).toEqual([
      [b.ref, 1],
      [c.ref, 2],
    ]);
    await expect(updateTask(OWNER, a.ref, { addDeps: [c.ref] })).rejects.toThrow(/cycle/);
    await expect(updateTask(OWNER, a.ref, { addDeps: [a.ref] })).rejects.toThrow(/itself/);
    const r = await updateTask(OWNER, c.ref, { removeDeps: [b.ref] });
    expect(r.dependsOn).toEqual([]);
    expect(r.activity[0].changes.dependsOn).toEqual({ from: [b.ref], to: [] });
  });

  it("rejects deps across Spaces", async () => {
    const { space: a } = await makeSpace();
    const { space: b } = await makeSpace();
    const x = await createTask(OWNER, { spaceId: a.id, title: "x" });
    const y = await createTask(OWNER, { spaceId: b.id, title: "y" });
    await expect(updateTask(OWNER, x.ref, { addDeps: [y.ref] })).rejects.toThrow(/same Space/);
  });
});

describe("move and reorder", () => {
  it("moves between columns and positions before/after cards", async () => {
    const { space } = await makeSpace();
    const a = await createTask(OWNER, { spaceId: space.id, title: "a", status: "In Progress" });
    const b = await createTask(OWNER, { spaceId: space.id, title: "b", status: "In Progress" });
    const c = await createTask(OWNER, { spaceId: space.id, title: "c" });
    const moved = await moveTask(OWNER, { ref: c.ref, status: "In Progress", beforeRef: b.ref });
    expect(moved.status).toBe("In Progress");
    expect(moved.ordinal).toBeGreaterThan(a.ordinal);
    expect(moved.ordinal).toBeLessThan(b.ordinal);
    const col = await listTasks(OWNER, { spaces: [space.id], status: ["In Progress"] });
    expect(col.items.map((t) => t.ref)).toEqual([a.ref, c.ref, b.ref]);
    await moveTask(OWNER, { ref: a.ref, afterRef: b.ref });
    const col2 = await listTasks(OWNER, { spaces: [space.id], status: ["In Progress"] });
    expect(col2.items.map((t) => t.ref)).toEqual([c.ref, b.ref, a.ref]);
    const t = await getTask(OWNER, c.ref);
    expect(t.activity[0].action).toBe("status");
    const tb = await getTask(OWNER, a.ref);
    expect(tb.activity[0].action).toBe("moved");
  });

  it("renumbers a column when the gap runs out", async () => {
    const { space } = await makeSpace();
    const a = await createTask(OWNER, { spaceId: space.id, title: "a", status: "Done" });
    const b = await createTask(OWNER, { spaceId: space.id, title: "b", status: "Done" });
    const x = await createTask(OWNER, { spaceId: space.id, title: "x", status: "Done" });
    for (let i = 0; i < 60; i++) await moveTask(OWNER, { ref: x.ref, afterRef: a.ref });
    await moveTask(OWNER, { ref: b.ref, afterRef: a.ref });
    const col = await listTasks(OWNER, { spaces: [space.id], status: ["Done"] });
    expect(col.items.map((t) => t.ref)).toEqual([a.ref, b.ref, x.ref]);
  });

  it("reorderTasks puts tasks in the given order", async () => {
    const { space } = await makeSpace();
    const a = await createTask(OWNER, { spaceId: space.id, title: "a" });
    const b = await createTask(OWNER, { spaceId: space.id, title: "b" });
    const c = await createTask(OWNER, { spaceId: space.id, title: "c" });
    await reorderTasks(OWNER, { refs: [c.ref, a.ref, b.ref] });
    const col = await listTasks(OWNER, { spaces: [space.id] });
    expect(col.items.map((t) => t.ref)).toEqual([c.ref, a.ref, b.ref]);
  });
});

describe("archive, restore, delete", () => {
  it("archives with descendants, restores together, deletes only archived leaf tasks", async () => {
    const { space } = await makeSpace();
    const p = await createTask(OWNER, { spaceId: space.id, title: "parent" });
    const c = await createTask(OWNER, { parent: p.ref, title: "child" });
    await expect(deleteTask(OWNER, p.ref)).rejects.toMatchObject({ code: "invalid" });
    const ap = await archiveTask(OWNER, p.ref);
    expect(ap.archivedAt).not.toBeNull();
    expect((await getTask(OWNER, c.ref)).archivedAt).not.toBeNull();
    await expect(restoreTask(OWNER, c.ref)).rejects.toThrow(/parent/);
    await expect(deleteTask(OWNER, p.ref)).rejects.toMatchObject({ code: "conflict" });
    const listed = await listTasks(OWNER, { spaces: [space.id], archivedOnly: true });
    expect(listed.items.map((t) => t.ref).sort()).toEqual([c.ref, p.ref].sort());
    expect((await listTasks(OWNER, { spaces: [space.id] })).total).toBe(0);

    await restoreTask(OWNER, p.ref);
    expect((await getTask(OWNER, c.ref)).archivedAt).toBeNull();

    await archiveTask(OWNER, p.ref);
    await deleteTask(OWNER, c.ref);
    const res = await deleteTask(OWNER, p.ref);
    expect(res.deleted).toBe(true);
    await expect(getTask(OWNER, p.ref)).rejects.toMatchObject({ code: "not_found" });
    const log = await listActivity(OWNER, { entityRef: p.ref });
    expect(log.items[0].action).toBe("deleted");
    expect(log.items.length).toBeGreaterThan(2);
  });
});

describe("drafts", () => {
  it("creates drafts hidden from the board, promotes and demotes", async () => {
    const { space } = await makeSpace();
    const d = await createTask(OWNER, { spaceId: space.id, title: "idea", isDraft: true });
    expect(d.isDraft).toBe(true);
    expect((await listTasks(OWNER, { spaces: [space.id] })).total).toBe(0);
    expect((await listTasks(OWNER, { spaces: [space.id], drafts: "only" })).total).toBe(1);
    const p = await promoteDraft(OWNER, d.ref);
    expect(p.isDraft).toBe(false);
    expect(p.activity[0].action).toBe("promoted");
    const back = await demoteTask(OWNER, d.ref);
    expect(back.isDraft).toBe(true);
    expect(back.activity[0].action).toBe("demoted");
  });
});

describe("cleanupDone", () => {
  it("archives done tasks older than N days only", async () => {
    const { space } = await makeSpace();
    const old = await createTask(OWNER, { spaceId: space.id, title: "old", status: "Done" });
    const fresh = await createTask(OWNER, { spaceId: space.id, title: "fresh", status: "Done" });
    const open = await createTask(OWNER, { spaceId: space.id, title: "open" });
    const db = await getDb();
    const past = new Date(Date.now() - 10 * 86_400_000);
    await db.update(tasks).set({ updatedAt: past }).where(eq(tasks.ref, old.ref));
    await db.update(tasks).set({ updatedAt: past }).where(eq(tasks.ref, open.ref));
    const r = await cleanupDone(OWNER, { olderThanDays: 7, spaces: [space.id] });
    expect(r.archived).toEqual([old.ref]);
    expect((await getTask(OWNER, fresh.ref)).archivedAt).toBeNull();
    expect((await getTask(OWNER, open.ref)).archivedAt).toBeNull();
  });
});

describe("list filters and sorting", () => {
  it("filters by status, exclude, type, labels (all of), priority, assignee, parent, topLevelOnly, q", async () => {
    const { space } = await makeSpace();
    const f = await createTask(OWNER, {
      spaceId: space.id,
      title: "Payment page redesign",
      labels: ["ui", "waiting"],
      priority: "High",
      assignees: ["sam"],
    });
    const s = await createTask(OWNER, { parent: f.ref, title: "Card form", labels: ["ui"], status: "Done" });
    const x = await createTask(OWNER, { spaceId: space.id, title: "Broken link", type: "fix", priority: "Low" });
    const only = { spaces: [space.id] };
    const refs = async (filters: Parameters<typeof listTasks>[1]) =>
      (await listTasks(OWNER, { ...only, ...filters })).items.map((t) => t.ref).sort();
    expect(await refs({ status: ["Done"] })).toEqual([s.ref]);
    expect(await refs({ excludeStatus: ["Done"] })).toEqual([f.ref, x.ref].sort());
    expect(await refs({ type: ["fix"] })).toEqual([x.ref]);
    expect(await refs({ labels: ["ui", "waiting"] })).toEqual([f.ref]);
    expect(await refs({ labels: ["ui"] })).toEqual([f.ref, s.ref].sort());
    expect(await refs({ priority: ["High"] })).toEqual([f.ref]);
    expect(await refs({ assignee: "sam" })).toEqual([f.ref]);
    expect(await refs({ parent: f.ref })).toEqual([s.ref]);
    expect(await refs({ topLevelOnly: true })).toEqual([f.ref, x.ref].sort());
    expect(await refs({ q: "redesign payment" })).toEqual([f.ref]);
    const sorted = await listTasks(OWNER, { ...only, sort: "priority" });
    expect(sorted.items[0].ref).toBe(f.ref);
    const byRef = await listTasks(OWNER, { ...only, sort: "ref" });
    expect(byRef.items.map((t) => t.ref)).toEqual([f.ref, s.ref, x.ref]);
    const feature = (await listTasks(OWNER, { ...only, type: ["feature"] })).items[0];
    expect(feature.childTotal).toBe(1);
    expect(feature.childDone).toBe(1);
    const page = await listTasks(OWNER, { ...only, limit: 1, offset: 1, sort: "ref" });
    expect(page.items.map((t) => t.ref)).toEqual([s.ref]);
    expect(page.total).toBe(3);
  });
});

describe("comments and export", () => {
  it("adds comments with the actor as author", async () => {
    const { space, chat } = await makeSpace();
    const t = await createTask(chat, { title: "talk" });
    expect(t.space.id).toBe(space.id);
    const c = await addComment({ ...chat, actor: "build-bot" }, t.ref, { body: "Looks good" });
    expect(c.author).toBe("build-bot");
    const full = await getTask(OWNER, t.ref);
    expect(full.comments.map((x) => x.body)).toEqual(["Looks good"]);
    expect(full.activity[0].action).toBe("commented");
  });

  it("exports the board as markdown", async () => {
    const { space } = await makeSpace();
    const f = await createTask(OWNER, { spaceId: space.id, title: "Exported feature", acceptanceCriteria: ["x"] });
    await createTask(OWNER, { parent: f.ref, title: "Exported child" });
    const md = await exportBoardMarkdown(OWNER, { spaces: [space.id] });
    expect(md).toContain("## To Do (1)");
    expect(md).toContain(`**${f.ref}** Exported feature`);
    expect(md).toContain(`  - [ ] **${f.ref}.1** Exported child`);
    expect(md).toContain("AC 0/1");
  });
});

describe("reparenting", () => {
  it("moves a task (and its subtasks) under a new parent with new refs, keeping history", async () => {
    const { space, chat } = await makeSpace();
    const a = await createTask(chat, { title: "A" });
    const b = await createTask(chat, { title: "B" });
    const child = await createTask(chat, { parent: a.ref, title: "child" });
    const grand = await createTask(chat, { parent: child.ref, title: "grandchild" });
    await addComment(chat, child.ref, { body: "keep me" });

    const moved = await updateTask(chat, child.ref, { parent: b.ref });
    expect(moved.ref).toBe(`${b.ref}.1`);
    expect(moved.parent?.ref).toBe(b.ref);
    expect(moved.children.map((c) => c.ref)).toEqual([`${b.ref}.1.1`]);
    expect(moved.comments.map((c) => c.body)).toEqual(["keep me"]);
    expect(moved.activity.map((r) => r.action)).toEqual(expect.arrayContaining(["moved", "commented", "created"]));
    await expect(getTask(chat, child.ref)).rejects.toMatchObject({ code: "not_found" });
    expect((await getTask(chat, `${b.ref}.1.1`)).title).toBe(grand.title);
    expect((await getTask(chat, a.ref)).children).toEqual([]);

    // back to top level
    const top = await updateTask(chat, moved.ref, { parent: null });
    expect(top.ref).toMatch(/^T-\d+$/);
    expect(top.parent).toBeNull();
    expect(top.children.map((c) => c.ref)).toEqual([`${top.ref}.1`]);

    // no cycles, same Space only
    await expect(updateTask(chat, top.ref, { parent: `${top.ref}.1` })).rejects.toMatchObject({ code: "invalid" });
    await expect(updateTask(chat, top.ref, { parent: top.ref })).rejects.toMatchObject({ code: "invalid" });
    const other = await makeSpace();
    const foreign = await createTask(other.chat, { title: "elsewhere" });
    await expect(updateTask(OWNER, top.ref, { parent: foreign.ref })).rejects.toMatchObject({ code: "invalid" });
    // a chat cannot use a parent outside its Spaces
    await expect(updateTask(chat, top.ref, { parent: foreign.ref })).rejects.toMatchObject({ code: "not_found" });
    expect(space.id).toBe(top.space.id);
  });
});
