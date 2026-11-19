import { describe, expect, it } from "vitest";
import * as svc from "@/server/service";
import { makeSpace, OWNER, setupTestDb } from "@/server/service/test-helpers";
import { loadTaskDetail } from "./task-detail-data";

setupTestDb();

describe("loadTaskDetail", () => {
  it("returns the task with settings, live Spaces and only its Space's milestones", async () => {
    const a = await makeSpace("detail A");
    const b = await makeSpace("detail B");
    const archived = await makeSpace("detail C");
    await svc.archiveSpace(OWNER, archived.space.id);
    const ma = await svc.createMilestone(OWNER, { spaceId: a.space.id, title: "A1" });
    await svc.createMilestone(OWNER, { spaceId: b.space.id, title: "B1" });
    const t = await svc.createTask(OWNER, { spaceId: a.space.id, title: "Hello", milestone: ma.ref });

    const d = await loadTaskDetail(OWNER, t.ref.toLowerCase());
    expect(d.task.ref).toBe(t.ref);
    expect(d.settings.statuses.length).toBeGreaterThan(0);
    expect(d.milestones.map((m) => m.ref)).toEqual([ma.ref]);
    const ids = d.spaces.map((s) => s.id);
    expect(ids).toContain(a.space.id);
    expect(ids).toContain(b.space.id);
    expect(ids).not.toContain(archived.space.id);
  });

  it("is NotFound for a chat without the task's Space", async () => {
    const a = await makeSpace("detail D");
    const b = await makeSpace("detail E");
    const t = await svc.createTask(OWNER, { spaceId: a.space.id, title: "Secret" });
    await expect(loadTaskDetail(b.chat, t.ref)).rejects.toMatchObject({ code: "not_found" });
  });
});
