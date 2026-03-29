import { describe, it, expect } from "vitest";
import { getTheme, setTheme, getThemeNames } from "./theme.js";

describe("theme", () => {
  it("returns default theme colors", () => {
    setTheme("default");
    const theme = getTheme();
    expect(theme.name).toBe("default");
    expect(theme.border).toBeDefined();
    expect(theme.titleBar).toBeDefined();
    expect(theme.statusBar).toBeDefined();
  });

  it("lists available theme names", () => {
    const names = getThemeNames();
    expect(names).toContain("default");
    expect(names).toContain("minimal");
    expect(names).toContain("catppuccin");
  });

  it("switches themes", () => {
    setTheme("minimal");
    expect(getTheme().name).toBe("minimal");
    setTheme("catppuccin");
    expect(getTheme().name).toBe("catppuccin");
  });
});
