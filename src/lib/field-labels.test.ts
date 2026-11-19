import { describe, expect, it } from "vitest";
import { fieldLabel, fieldList } from "./field-labels";

describe("fieldLabel", () => {
  it("uses the readable name for known keys", () => {
    expect(fieldLabel("dueDate")).toBe("due date");
    expect(fieldLabel("finalSummary")).toBe("final summary");
    expect(fieldLabel("spaceId")).toBe("Space");
  });

  it("splits unknown camelCase keys and keeps plain ones", () => {
    expect(fieldLabel("someNewField")).toBe("some new field");
    expect(fieldLabel("title")).toBe("title");
  });

  it("joins a list", () => {
    expect(fieldList(["title", "dueDate", "modifiedFiles"])).toBe("title, due date, modified files");
  });
});
