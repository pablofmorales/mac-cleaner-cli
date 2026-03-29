import { describe, it, expect } from "vitest";
import { COMMAND_GROUPS, getGroupForCommand } from "./commandGroups.js";

describe("commandGroups", () => {
  it("has 5 groups", () => {
    expect(Object.keys(COMMAND_GROUPS)).toHaveLength(5);
  });

  it("maps system to cleanup", () => {
    expect(getGroupForCommand("system")).toBe("cleanup");
  });

  it("maps privacy to protection", () => {
    expect(getGroupForCommand("privacy")).toBe("protection");
  });

  it("maps maintain to speed", () => {
    expect(getGroupForCommand("maintain")).toBe("speed");
  });

  it("maps apps to applications", () => {
    expect(getGroupForCommand("apps")).toBe("applications");
  });

  it("maps large-files to files", () => {
    expect(getGroupForCommand("large-files")).toBe("files");
  });

  it("returns undefined for unknown commands", () => {
    expect(getGroupForCommand("nonexistent")).toBeUndefined();
  });
});
