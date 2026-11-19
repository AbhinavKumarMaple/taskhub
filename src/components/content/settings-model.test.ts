import { describe, expect, it } from "vitest";
import { isDirty, moveRow, newRow, planList, rowsFrom } from "./settings-model";

describe("planList", () => {
  it("returns the values unchanged with no renames", () => {
    const rows = rowsFrom(["To Do", "In Progress", "Done"]);
    expect(planList(rows, ["To Do", "In Progress", "Done"])).toEqual({
      ok: true,
      values: ["To Do", "In Progress", "Done"],
      renames: [],
      removed: [],
      added: [],
    });
  });

  it("turns an edited row into a rename and keeps its position", () => {
    const rows = rowsFrom(["To Do", "Doing", "Done"]);
    rows[1] = { ...rows[1], value: "  In Progress " };
    const p = planList(rows, ["To Do", "Doing", "Done"]);
    expect(p).toMatchObject({ ok: true, values: ["To Do", "In Progress", "Done"], renames: [{ from: "Doing", to: "In Progress" }] });
  });

  it("reports added and removed values", () => {
    const rows = rowsFrom(["High", "Medium", "Low"]).filter((r) => r.value !== "Medium");
    rows.push(newRow("Urgent"));
    const p = planList(rows, ["High", "Medium", "Low"]);
    expect(p).toMatchObject({ ok: true, values: ["High", "Low", "Urgent"], removed: ["Medium"], added: ["Urgent"], renames: [] });
  });

  it("rejects empty values and duplicates", () => {
    expect(planList([newRow(" ")], [])).toMatchObject({ ok: false });
    expect(planList([newRow("a"), newRow("a")], [])).toMatchObject({ ok: false, error: expect.stringContaining("twice") });
  });

  it("rejects an empty list unless allowed", () => {
    expect(planList([], ["x"])).toMatchObject({ ok: false });
    expect(planList([], ["x"], { allowEmptyList: true })).toMatchObject({ ok: true, values: [], removed: ["x"] });
  });

  it("rejects renaming onto a value that already exists (no silent merge)", () => {
    const rows = rowsFrom(["A", "B"]);
    rows[0] = { ...rows[0], value: "B" };
    rows[1] = { ...rows[1], value: "A" };
    expect(planList(rows, ["A", "B"])).toMatchObject({ ok: false, error: expect.stringContaining("already exists") });
  });

  it("does not produce renames when renames are off (DoD defaults)", () => {
    const rows = rowsFrom(["Tests pass"]);
    rows[0] = { ...rows[0], value: "Tests and lint pass" };
    expect(planList(rows, ["Tests pass"], { renames: false, allowEmptyList: true })).toMatchObject({
      ok: true,
      values: ["Tests and lint pass"],
      renames: [],
    });
  });
});

describe("moveRow / isDirty", () => {
  it("moves within bounds and is a no-op at the edges", () => {
    expect(moveRow([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveRow([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveRow([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it("detects reorder, edit, add and remove", () => {
    const saved = ["a", "b"];
    const rows = rowsFrom(saved);
    expect(isDirty(rows, saved)).toBe(false);
    expect(isDirty(moveRow(rows, 0, 1), saved)).toBe(true);
    expect(isDirty([rows[0]], saved)).toBe(true);
    expect(isDirty([...rows, newRow("c")], saved)).toBe(true);
    expect(isDirty([rows[0], { ...rows[1], value: "c" }], saved)).toBe(true);
  });
});
