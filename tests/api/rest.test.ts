import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/server/service/test-helpers";
import * as activityRoute from "@/app/api/v1/activity/route";
import * as boardRoute from "@/app/api/v1/board.md/route";
import * as decisionsRoute from "@/app/api/v1/decisions/route";
import * as decisionRoute from "@/app/api/v1/decisions/[ref]/route";
import * as documentsRoute from "@/app/api/v1/documents/route";
import * as documentRoute from "@/app/api/v1/documents/[ref]/route";
import * as documentActionRoute from "@/app/api/v1/documents/[ref]/[action]/route";
import * as instructionsRoute from "@/app/api/v1/instructions/route";
import * as milestonesRoute from "@/app/api/v1/milestones/route";
import * as milestoneRoute from "@/app/api/v1/milestones/[ref]/route";
import * as searchRoute from "@/app/api/v1/search/route";
import * as settingsRoute from "@/app/api/v1/settings/route";
import * as spacesRoute from "@/app/api/v1/spaces/route";
import * as spaceRoute from "@/app/api/v1/spaces/[id]/route";
import * as statisticsRoute from "@/app/api/v1/statistics/route";
import * as tasksRoute from "@/app/api/v1/tasks/route";
import * as taskRoute from "@/app/api/v1/tasks/[ref]/route";
import * as taskActionRoute from "@/app/api/v1/tasks/[ref]/[action]/route";
import * as moveRoute from "@/app/api/v1/tasks/move/route";
import * as versionRoute from "@/app/api/v1/version/route";
import { call } from "./helpers";

setupTestDb();

async function newSpace(name: string) {
  const r = await call(spacesRoute.POST, "POST", "/spaces", { body: { name } });
  expect(r.status).toBe(201);
  return r.body as { id: string; key: string; name: string };
}

describe("auth", () => {
  it("rejects missing or wrong agent tokens with 401", async () => {
    for (const token of [null, "wrong"]) {
      const r = await call(tasksRoute.GET, "GET", "/tasks", { token });
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe("unauthorized");
    }
    const r = await call(searchRoute.GET, "GET", "/search", { token: null, query: { q: "x" } });
    expect(r.status).toBe(401);
    const mcpLike = await call(versionRoute.GET, "GET", "/version", { token: "nope" });
    expect(mcpLike.status).toBe(401);
  });

  it("a valid token without keys sees nothing but may create a Space", async () => {
    const r = await call(tasksRoute.GET, "GET", "/tasks");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [], total: 0 });
    expect((await call(spacesRoute.GET, "GET", "/spaces")).body).toEqual([]);
    const s = await newSpace("Keyless chat");
    expect(s.key).toMatch(/^sk_/);
  });

  it("the owner cookie sees every Space", async () => {
    await newSpace("Owner visible");
    const r = await call(spacesRoute.GET, "GET", "/spaces", { owner: true, token: null });
    expect(r.status).toBe(200);
    expect(r.body.map((s: { name: string }) => s.name)).toContain("Owner visible");
  });
});

describe("tasks round trip", () => {
  it("creates, lists, edits, moves, comments, archives and deletes", async () => {
    const s = await newSpace("Round trip");
    const key = s.key;

    const created = await call(tasksRoute.POST, "POST", "/tasks", {
      key,
      actor: "tester",
      body: { title: "Build the thing", type: "feature", acceptance_criteria: ["works"], no_dod_defaults: true },
    });
    expect(created.status).toBe(201);
    const ref = created.body.ref as string;
    expect(ref).toMatch(/^T-\d+$/);
    expect(created.body.acceptanceCriteria).toHaveLength(1);

    const child = await call(tasksRoute.POST, "POST", "/tasks", { key, body: { title: "Part one", parent: ref } });
    expect(child.body.ref).toBe(`${ref}.1`);
    expect(child.body.type).toBe("sub-feature");

    const listed = await call(tasksRoute.GET, "GET", "/tasks", { key, query: { type: "feature" } });
    expect(listed.body.items.map((t: { ref: string }) => t.ref)).toEqual([ref]);
    const viaQueryKey = await call(tasksRoute.GET, "GET", "/tasks", { query: { space_key: key, top_level_only: "true" } });
    expect(viaQueryKey.body.total).toBe(1);

    const patched = await call(taskRoute.PATCH, "PATCH", `/tasks/${ref.toLowerCase()}`, {
      key,
      params: { ref: ref.toLowerCase() },
      body: { checkAc: [1], appendNotes: "started", add_labels: ["waiting"] },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.acDone).toBe(1);
    expect(patched.body.labels).toEqual(["waiting"]);
    expect(patched.body.notes).toContain("started");

    const moved = await call(moveRoute.POST, "POST", "/tasks/move", { key, body: { ref, status: "In Progress" } });
    expect(moved.status).toBe(200);
    expect(moved.body.status).toBe("In Progress");

    const comment = await call(taskActionRoute.POST, "POST", `/tasks/${ref}/comments`, {
      key,
      actor: "tester",
      params: { ref, action: "comments" },
      body: { body: "Looks good" },
    });
    expect(comment.status).toBe(201);
    expect(comment.body.author).toBe("tester");
    const comments = await call(taskActionRoute.GET, "GET", `/tasks/${ref}/comments`, { key, params: { ref, action: "comments" } });
    expect(comments.body).toHaveLength(1);

    const view = await call(taskRoute.GET, "GET", `/tasks/${ref}`, { key, params: { ref } });
    expect(view.body.children).toHaveLength(1);
    expect(view.body.activity.some((a: { actor: string }) => a.actor === "tester")).toBe(true);

    const bad = await call(taskActionRoute.POST, "POST", `/tasks/${ref}/explode`, { key, params: { ref, action: "explode" } });
    expect(bad.status).toBe(404);

    // delete needs archived + no children
    const notArchived = await call(taskRoute.DELETE, "DELETE", `/tasks/${ref}`, { key, params: { ref } });
    expect(notArchived.status).toBe(400);
    await call(taskActionRoute.POST, "POST", `/tasks/${ref}/archive`, { key, params: { ref, action: "archive" } });
    const hasKids = await call(taskRoute.DELETE, "DELETE", `/tasks/${ref}`, { key, params: { ref } });
    expect(hasKids.status).toBe(409);
    const childDel = await call(taskRoute.DELETE, "DELETE", `/tasks/${ref}.1`, { key, params: { ref: `${ref}.1` } });
    expect(childDel.body).toEqual({ ref: `${ref}.1`, deleted: true });
    const del = await call(taskRoute.DELETE, "DELETE", `/tasks/${ref}`, { key, params: { ref } });
    expect(del.status).toBe(200);
    const gone = await call(taskRoute.GET, "GET", `/tasks/${ref}`, { key, params: { ref } });
    expect(gone.status).toBe(404);

    // drafts: promote / demote
    const draft = await call(tasksRoute.POST, "POST", "/tasks", { key, body: { title: "Idea", isDraft: true } });
    const dref = draft.body.ref as string;
    const promoted = await call(taskActionRoute.POST, "POST", `/tasks/${dref}/promote`, { key, params: { ref: dref, action: "promote" } });
    expect(promoted.body.isDraft).toBe(false);
    const demoted = await call(taskActionRoute.POST, "POST", `/tasks/${dref}/demote`, { key, params: { ref: dref, action: "demote" } });
    expect(demoted.body.isDraft).toBe(true);
  });

  it("returns 400 for invalid input and bad JSON", async () => {
    const s = await newSpace("Validation");
    const r = await call(tasksRoute.POST, "POST", "/tasks", { key: s.key, body: { title: "" } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("invalid");
    const res = await tasksRoute.POST(
      new Request("http://localhost/api/v1/tasks", {
        method: "POST",
        headers: { authorization: "Bearer dev-token", "x-space-key": s.key },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    // Names are unique among the Spaces the caller holds: a duplicate is a 409 only with that Space's key.
    const dup = await call(spacesRoute.POST, "POST", "/spaces", { key: s.key, body: { name: "validation" } });
    expect(dup.status).toBe(409);
    const blind = await call(spacesRoute.POST, "POST", "/spaces", { body: { name: "validation" } });
    expect(blind.status).toBe(201);
  });
});

describe("milestones, documents, decisions, settings, misc", () => {
  it("round trips each entity kind", async () => {
    const s = await newSpace("Entities");
    const key = s.key;

    const m = await call(milestonesRoute.POST, "POST", "/milestones", { key, body: { title: "v1", due_date: "2030-01-01" } });
    expect(m.status).toBe(201);
    expect(m.body.ref).toMatch(/^M-\d+$/);
    const mEdit = await call(milestoneRoute.PATCH, "PATCH", `/milestones/${m.body.ref}`, {
      key,
      params: { ref: m.body.ref },
      body: { title: "v1.0" },
    });
    expect(mEdit.body.title).toBe("v1.0");
    expect((await call(milestonesRoute.GET, "GET", "/milestones", { key })).body).toHaveLength(1);

    const d = await call(documentsRoute.POST, "POST", "/documents", { key, body: { title: "Notes", body: "# Hi" } });
    const dref = d.body.ref as string;
    expect((await call(documentRoute.GET, "GET", `/documents/${dref}`, { key, params: { ref: dref } })).body.body).toBe("# Hi");
    const arch = await call(documentActionRoute.POST, "POST", `/documents/${dref}/archive`, {
      key,
      params: { ref: dref, action: "archive" },
    });
    expect(arch.body.archivedAt).toBeTruthy();
    expect((await call(documentsRoute.GET, "GET", "/documents", { key })).body).toHaveLength(0);
    expect((await call(documentsRoute.GET, "GET", "/documents", { key, query: { archived_only: "true" } })).body).toHaveLength(1);
    const del = await call(documentRoute.DELETE, "DELETE", `/documents/${dref}`, { key, params: { ref: dref } });
    expect(del.body.deleted).toBe(true);

    const dec = await call(decisionsRoute.POST, "POST", "/decisions", { key, body: { title: "Use Postgres", context: "c" } });
    const decRef = dec.body.ref as string;
    const decEdit = await call(decisionRoute.PATCH, "PATCH", `/decisions/${decRef}`, {
      key,
      params: { ref: decRef },
      body: { status: "accepted" },
    });
    expect(decEdit.body.status).toBe("accepted");
    expect((await call(decisionsRoute.GET, "GET", "/decisions", { key, query: { status: "accepted" } })).body).toHaveLength(1);

    const settings = await call(settingsRoute.GET, "GET", "/settings", { key });
    expect(settings.body.statuses).toEqual(["To Do", "In Progress", "Blocked", "Done", "Cancelled"]);
    const forbidden = await call(settingsRoute.PATCH, "PATCH", "/settings", { key, body: { labels: ["waiting", "x"] } });
    expect(forbidden.status).toBe(403);

    const space = await call(spaceRoute.GET, "GET", `/spaces/${s.id}`, { key, params: { id: s.id } });
    expect(space.body.name).toBe("Entities");
    const renamed = await call(spaceRoute.PATCH, "PATCH", `/spaces/${s.id}`, { key, params: { id: s.id }, body: { color: "teal" } });
    expect(renamed.body.color).toBe("teal");

    const ins = await call(instructionsRoute.GET, "GET", "/instructions");
    expect(ins.body).toContain("Taskhub tracking rules");
  });

  it("version changes on writes; board.md, statistics and activity respond", async () => {
    const s = await newSpace("Polling");
    const key = s.key;
    const v1 = await call(versionRoute.GET, "GET", "/version", { key, query: { space: s.id } });
    expect(typeof v1.body.version).toBe("string");
    expect((await call(versionRoute.GET, "GET", "/version", { key, query: { space: s.id } })).body.version).toBe(v1.body.version);
    await call(tasksRoute.POST, "POST", "/tasks", { key, body: { title: "Poll me", type: "feature" } });
    const v2 = await call(versionRoute.GET, "GET", "/version", { key, query: { space: s.id } });
    expect(v2.body.version).not.toBe(v1.body.version);

    const board = await call(boardRoute.GET, "GET", "/board.md", { key });
    expect(board.status).toBe(200);
    expect(board.body).toContain("Poll me");
    expect(board.body).toContain("## To Do (1)");

    const stats = await call(statisticsRoute.GET, "GET", "/statistics", { key });
    expect(stats.body.total).toBe(1);

    const act = await call(activityRoute.GET, "GET", "/activity", { key, query: { limit: "5" } });
    expect(act.body.items.length).toBeGreaterThan(0);
    const search = await call(searchRoute.GET, "GET", "/search", { key, query: { q: "me poll" } });
    expect(search.body.map((r: { title: string }) => r.title)).toContain("Poll me");
  });
});

describe("isolation: key A never reaches Space B", () => {
  it("404s or hides B's data on every endpoint", async () => {
    const A = await newSpace("Iso Alpha");
    const B = await newSpace("Iso Bravo");
    const b = (path: string, body: unknown) => ({ key: B.key, body, path });
    const bTask = (await call(tasksRoute.POST, "POST", "/tasks", b("/tasks", { title: "Quokka secret", labels: ["waiting"] }))).body;
    const bMs = (await call(milestonesRoute.POST, "POST", "/milestones", b("/milestones", { title: "Quokka milestone" }))).body;
    const bDoc = (await call(documentsRoute.POST, "POST", "/documents", b("/documents", { title: "Quokka doc" }))).body;
    const bDec = (await call(decisionsRoute.POST, "POST", "/decisions", b("/decisions", { title: "Quokka decision" }))).body;
    await call(tasksRoute.POST, "POST", "/tasks", { key: A.key, body: { title: "Alpha quokka" } });

    const key = A.key;
    const nf = async (p: Promise<{ status: number; body: { error?: { code: string } } }>) => {
      const r = await p;
      expect(r.status).toBe(404);
      expect(r.body.error?.code).toBe("not_found");
    };
    const ref = bTask.ref as string;

    await nf(call(taskRoute.GET, "GET", `/tasks/${ref}`, { key, params: { ref } }));
    await nf(call(taskRoute.PATCH, "PATCH", `/tasks/${ref}`, { key, params: { ref }, body: { title: "pwned" } }));
    await nf(call(taskRoute.DELETE, "DELETE", `/tasks/${ref}`, { key, params: { ref } }));
    for (const action of ["archive", "restore", "promote", "demote", "comments"]) {
      await nf(call(taskActionRoute.POST, "POST", `/tasks/${ref}/${action}`, { key, params: { ref, action }, body: { body: "x" } }));
    }
    await nf(call(moveRoute.POST, "POST", "/tasks/move", { key, body: { ref, status: "Done" } }));
    await nf(call(tasksRoute.POST, "POST", "/tasks", { key, body: { title: "child", parent: ref } }));
    await nf(call(tasksRoute.POST, "POST", "/tasks", { key, body: { title: "in B", spaceId: B.id } }));
    await nf(call(milestoneRoute.GET, "GET", `/milestones/${bMs.ref}`, { key, params: { ref: bMs.ref } }));
    await nf(call(documentRoute.GET, "GET", `/documents/${bDoc.ref}`, { key, params: { ref: bDoc.ref } }));
    await nf(call(decisionRoute.PATCH, "PATCH", `/decisions/${bDec.ref}`, { key, params: { ref: bDec.ref }, body: { title: "x" } }));
    await nf(call(spaceRoute.GET, "GET", `/spaces/${B.id}`, { key, params: { id: B.id } }));
    await nf(call(activityRoute.GET, "GET", "/activity", { key, query: { space: B.id } }));

    // lists, search, counts, exports never include B
    const tasks = await call(tasksRoute.GET, "GET", "/tasks", { key, query: { space: B.id } });
    expect(tasks.body.total).toBe(0);
    const all = await call(tasksRoute.GET, "GET", "/tasks", { key });
    expect(all.body.items.map((t: { title: string }) => t.title)).toEqual(["Alpha quokka"]);
    const search = await call(searchRoute.GET, "GET", "/search", { key, query: { q: "quokka" } });
    expect(search.body.map((r: { title: string }) => r.title)).toEqual(["Alpha quokka"]);
    const stats = await call(statisticsRoute.GET, "GET", "/statistics", { key, query: { space: B.id } });
    expect(stats.body.total).toBe(0);
    expect((await call(statisticsRoute.GET, "GET", "/statistics", { key })).body.waiting).toHaveLength(0);
    const act = await call(activityRoute.GET, "GET", "/activity", { key });
    expect(act.body.items.every((a: { spaceId: string }) => a.spaceId === A.id)).toBe(true);
    const board = await call(boardRoute.GET, "GET", "/board.md", { key, query: { space: B.id } });
    expect(board.body).not.toContain("Quokka");
    expect((await call(boardRoute.GET, "GET", "/board.md", { key })).body).not.toContain("Quokka secret");
    expect((await call(milestonesRoute.GET, "GET", "/milestones", { key })).body).toHaveLength(0);
    expect((await call(documentsRoute.GET, "GET", "/documents", { key, query: { space: B.id } })).body).toHaveLength(0);
    expect((await call(decisionsRoute.GET, "GET", "/decisions", { key })).body).toHaveLength(0);
    const spaces = await call(spacesRoute.GET, "GET", "/spaces", { key });
    expect(spaces.body.map((s: { id: string }) => s.id)).toEqual([A.id]);
    const vA = (await call(versionRoute.GET, "GET", "/version", { key })).body.version;
    await call(taskRoute.PATCH, "PATCH", `/tasks/${ref}`, { key: B.key, params: { ref }, body: { title: "B changed" } });
    expect((await call(versionRoute.GET, "GET", "/version", { key })).body.version).toBe(vA);

    // B's task is untouched
    const still = await call(taskRoute.GET, "GET", `/tasks/${ref}`, { key: B.key, params: { ref } });
    expect(still.body.title).toBe("B changed");
    expect(still.body.comments).toHaveLength(0);

    // holding both keys opens both (how the owner shares tasks between chats)
    const both = await call(tasksRoute.GET, "GET", "/tasks", { key: [A.key, B.key] });
    expect(both.body.total).toBe(2);
  });
});
