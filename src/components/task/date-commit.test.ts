import { describe, expect, it } from "vitest";
import { isCommittableDate } from "./date-commit";

describe("isCommittableDate", () => {
  it("skips the partial years a native date input reports while the year is typed", () => {
    expect(isCommittableDate("0002-12-15")).toBe(false);
    expect(isCommittableDate("0020-12-15")).toBe(false);
    expect(isCommittableDate("0202-12-15")).toBe(false);
  });

  it("accepts a full date and a cleared box", () => {
    expect(isCommittableDate("2026-12-15")).toBe(true);
    expect(isCommittableDate("")).toBe(true);
  });

  it("treats an empty value from a partly filled box as editing, not a clear", () => {
    expect(isCommittableDate("", true)).toBe(false);
    expect(isCommittableDate("2026-12-15", false)).toBe(true);
  });

  it("rejects anything that is not yyyy-mm-dd", () => {
    expect(isCommittableDate("15/12/2026")).toBe(false);
  });
});
