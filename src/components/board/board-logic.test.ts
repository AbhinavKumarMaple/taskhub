import { describe, expect, it } from "vitest";
import type { TaskSummary } from "@/lib/types";
import {
  ALL_LANE,
  NO_MILESTONE,
  applyMove,
  arrowTarget,
  buildContainers,
  buildLanes,
  containerId,
  findContainer,
  moveBetween,
  optimisticOrdinal,
  parseContainerId,
  placementOf,
  samePlacement,
} from "./board-logic";

const STATUSES = ["To Do", "In Progress", "Done"];

function task(ref: string, status: string, ordinal: number, milestone: string | null = null): TaskSummary {
  return {
    id: 0,
    ref,
    space: { id: "sp_aaaaaaaaaa", name: "S", color: "blue" },
    parentRef: null,
    isDraft: false,
    title: ref,
    status,
    statusReason: "",
    deployable: false,
    deployments: {},
    statusChangedAt: new Date(0),
    type: "feature",
    priority: null,
    labels: [],
    assignees: [],
    milestone: milestone ? { ref: milestone, title: `Milestone ${milestone}` } : null,
    dueDate: null,
    ordinal,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    archivedAt: null,
    acDone: 0,
    acTotal: 0,
    dodDone: 0,
    dodTotal: 0,
    childCounts: {},
    childTotal: 0,
    childDone: 0,
  };
}

describe("container ids", () => {
  it("round-trips statuses with spaces and the separator", () => {
    expect(parseContainerId(containerId("M-1", "In Progress"))).toEqual({ lane: "M-1", status: "In Progress" });
    expect(parseContainerId(containerId("all", "a|b"))).toEqual({ lane: "all", status: "a|b" });
  });
});

describe("buildContainers", () => {
  it("creates every column and sorts by ordinal", () => {
    const tasks = [task("T-2", "To Do", 2), task("T-1", "To Do", 1), task("T-3", "Done", 5)];
    const lanes = buildLanes(false, [], tasks);
    const c = buildContainers(tasks, STATUSES, lanes, false);
    expect(c).toEqual({
      [containerId(ALL_LANE, "To Do")]: ["T-1", "T-2"],
      [containerId(ALL_LANE, "In Progress")]: [],
      [containerId(ALL_LANE, "Done")]: ["T-3"],
    });
  });

  it("splits by milestone lane when grouped", () => {
    const tasks = [task("T-1", "To Do", 1, "M-1"), task("T-2", "To Do", 2)];
    const lanes = buildLanes(true, [{ ref: "M-1", title: "One" }, { ref: "M-2", title: "Two" }], tasks);
    expect(lanes.map((l) => l.key)).toEqual(["M-1", "M-2", NO_MILESTONE]);
    const c = buildContainers(tasks, STATUSES, lanes, true);
    expect(c[containerId("M-1", "To Do")]).toEqual(["T-1"]);
    expect(c[containerId(NO_MILESTONE, "To Do")]).toEqual(["T-2"]);
    expect(c[containerId("M-2", "Done")]).toEqual([]);
  });

  it("limits lanes to the milestone filter", () => {
    const ms = [{ ref: "M-1", title: "One" }, { ref: "M-2", title: "Two" }];
    expect(buildLanes(true, ms, [], "m-2").map((l) => l.key)).toEqual(["M-2"]);
    expect(buildLanes(true, ms, [], "none").map((l) => l.key)).toEqual([NO_MILESTONE]);
  });
});

describe("moving", () => {
  const items = { a: ["T-1", "T-2", "T-3"], b: ["T-4"] };

  it("finds containers by ref or id", () => {
    expect(findContainer(items, "T-4")).toBe("b");
    expect(findContainer(items, "a")).toBe("a");
    expect(findContainer(items, "T-9")).toBeUndefined();
  });

  it("moves across containers without mutating the input", () => {
    const out = moveBetween(items, "T-2", "b", 0);
    expect(out).toEqual({ a: ["T-1", "T-3"], b: ["T-2", "T-4"] });
    expect(items.a).toEqual(["T-1", "T-2", "T-3"]);
  });

  it("clamps the index", () => {
    expect(moveBetween(items, "T-1", "b", 99).b).toEqual(["T-4", "T-1"]);
  });

  it("describes a placement by neighbours", () => {
    const ids = { [containerId(ALL_LANE, "To Do")]: ["T-1", "T-2", "T-3"] };
    expect(placementOf(ids, "T-2")).toEqual({
      ref: "T-2",
      status: "To Do",
      lane: ALL_LANE,
      afterRef: "T-1",
      beforeRef: "T-3",
    });
    expect(placementOf(ids, "T-1")?.afterRef).toBeUndefined();
    expect(placementOf(ids, "T-3")?.beforeRef).toBeUndefined();
  });

  it("compares placements", () => {
    const p = { ref: "T-1", status: "A", lane: "all", afterRef: "T-0" };
    expect(samePlacement(p, { ...p })).toBe(true);
    expect(samePlacement(p, { ...p, status: "B" })).toBe(false);
  });

  it("picks an ordinal between neighbours", () => {
    const ts = [task("T-1", "A", 1), task("T-2", "A", 2)];
    expect(optimisticOrdinal(ts, { afterRef: "T-1", beforeRef: "T-2" }, 0)).toBe(1.5);
    expect(optimisticOrdinal(ts, { afterRef: "T-2" }, 0)).toBe(3);
    expect(optimisticOrdinal(ts, { beforeRef: "T-1" }, 0)).toBe(0);
    expect(optimisticOrdinal(ts, {}, 7)).toBe(7);
  });

  it("applies a move to status, ordinal and milestone", () => {
    const ts = [task("T-1", "To Do", 1, "M-1"), task("T-2", "To Do", 2)];
    const out = applyMove(ts, { ref: "T-1", status: "Done", ordinal: 9, milestone: null });
    expect(out[0]).toMatchObject({ status: "Done", ordinal: 9, milestone: null });
    expect(out[1]).toBe(ts[1]);
    const kept = applyMove(ts, { ref: "T-1", status: "Done", ordinal: 9 });
    expect(kept[0].milestone?.ref).toBe("M-1");
  });
});

describe("arrowTarget", () => {
  const cols = [3, 0, 2];
  it("moves within a column", () => {
    expect(arrowTarget(cols, 0, 1, "ArrowDown")).toEqual({ col: 0, index: 2 });
    expect(arrowTarget(cols, 0, 2, "ArrowDown")).toBeNull();
    expect(arrowTarget(cols, 0, 0, "ArrowUp")).toBeNull();
  });
  it("skips empty columns and clamps the index", () => {
    expect(arrowTarget(cols, 0, 2, "ArrowRight")).toEqual({ col: 2, index: 1 });
    expect(arrowTarget(cols, 2, 0, "ArrowLeft")).toEqual({ col: 0, index: 0 });
    expect(arrowTarget(cols, 2, 0, "ArrowRight")).toBeNull();
  });
});
