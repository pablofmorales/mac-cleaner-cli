import { describe, it, expect } from "vitest";
import { getIcon, getIconSet, setIconSet } from "./icons.js";

describe("icons", () => {
  it("returns unicode icons by default", () => {
    setIconSet("unicode");
    expect(getIcon("success")).toBe("+");
    expect(getIcon("error")).toBe("x");
    expect(getIcon("checkbox_on")).toBe("[x]");
    expect(getIcon("checkbox_off")).toBe("[ ]");
  });

  it("returns nerd font icons when set", () => {
    setIconSet("nerd");
    expect(getIcon("success")).toBe("\uf00c");
    expect(getIcon("error")).toBe("\uf00d");
  });

  it("defaults to unicode icon set", () => {
    setIconSet("unicode");
    expect(getIconSet()).toBe("unicode");
  });
});
