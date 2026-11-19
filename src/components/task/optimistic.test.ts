import { describe, expect, it } from "vitest";
import { applyChecklistOps } from "@/server/service/tasks";
import type { ChecklistItem, TaskFull } from "@/lib/types";
import { applyChecklist, applyOptimistic } from "./optimistic";

const items = (spec: string): ChecklistItem[] =>
  spec.split(",").map((s, i) => ({ id: i + 1, text: s.replace("*", ""), checked: s.endsWith("*"), position: i + 1 }));
const plain = (l: { text: string; checked: boolean }[]) => l.map((x) => `${x.checked ? "x" : "o"}:${x.text}`);

describe("applyChecklist mirrors the service", () => {
  const cases: [string, Parameters<typeof applyChecklist>[1]][] = [
    ["check + uncheck", { check: [1, 3], uncheck: [2] }],
    ["edit", { edit: [{ index: 2, text: "B2" }] }],
    ["reorder", { reorder: [3, 1, 2] }],
    ["remove after reorder uses original indexes", { reorder: [3, 2, 1], remove: [1] }],
    ["set keeps checks on identical text", { set: ["c", "a", "z"] }],
    ["set then check uses the new list", { set: ["z", "a"], check: [1] }],
    ["add appends", { add: ["d"], remove: [2] }],
  ];
  for (const [name, ops] of cases) {
    it(name, () => {
      const cur = items("a*,b*,c");
      const mine = applyChecklist(cur, ops);
      const theirs = applyChecklistOps(cur, ops, "AC");
      expect(plain(mine)).toEqual(plain(theirs));
      expect(mine.map((x) => x.position)).toEqual(mine.map((_, i) => i + 1));
    });
  }
});

describe("applyOptimistic", () => {
  const base = {
    ref: "T-1",
    title: "Old",
    labels: ["a"],
    milestone: null,
    space: { id: "sp_aaaaaaaaaa", name: "One", color: "blue" },
    acceptanceCriteria: items("a,b"),
    definitionOfDone: [],
    acDone: 0,
    acTotal: 2,
    dodDone: 0,
    dodTotal: 0,
    dependsOn: [
      { ref: "T-2", title: "x", status: "To Do", type: "feature", archivedAt: null, depth: 1, via: null },
      { ref: "T-3", title: "y", status: "To Do", type: "feature", archivedAt: null, depth: 2, via: "T-2" },
    ],
  } as unknown as TaskFull;

  it("sets scalars, labels and AC counts", () => {
    const t = applyOptimistic(base, { title: " New ", addLabels: ["b"], removeLabels: ["a"], checkAc: [2] });
    expect(t.title).toBe("New");
    expect(t.labels).toEqual(["b"]);
    expect(t.acDone).toBe(1);
    expect(base.acDone).toBe(0);
  });

  it("resolves milestone titles and clears milestone on Space move", () => {
    const t = applyOptimistic(base, { milestone: "m-4" }, { milestones: [{ ref: "M-4", title: "Launch" }] });
    expect(t.milestone).toEqual({ ref: "M-4", title: "Launch" });
    const moved = applyOptimistic(t, { spaceId: "sp_bbbbbbbbbb" }, { spaces: [{ id: "sp_bbbbbbbbbb", name: "Two", color: "red" }] });
    expect(moved.space.name).toBe("Two");
    expect(moved.milestone).toBeNull();
  });

  it("removes direct deps", () => {
    const t = applyOptimistic(base, { removeDeps: ["t-2"] });
    expect(t.dependsOn.map((d) => d.ref)).toEqual([]);
  });
});
