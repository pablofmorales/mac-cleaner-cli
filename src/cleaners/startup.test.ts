import { describe, it, expect } from "vitest";
import { clean } from "./startup.js";

describe("startup cleaner", () => {
  it("dry-run returns ok:true", async () => {
    const result = await clean({ dryRun: true, json: true });
    expect(result.ok).toBe(true);
  });

  it("--json mode returns parseable CleanResult structure", async () => {
    const result = await clean({ dryRun: true, json: true });

    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("paths");
    expect(result).toHaveProperty("freed");
    expect(result).toHaveProperty("errors");
    expect(typeof result.ok).toBe("boolean");
    expect(Array.isArray(result.paths)).toBe(true);
    expect(typeof result.freed).toBe("number");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("freed is always 0 (audit-only module)", async () => {
    const result = await clean({ dryRun: true, json: true });
    expect(result.freed).toBe(0);
  });

  it("paths contains only .plist files", async () => {
    const result = await clean({ dryRun: true, json: true });
    for (const p of result.paths) {
      expect(p).toMatch(/\.plist$/);
    }
  });
});
