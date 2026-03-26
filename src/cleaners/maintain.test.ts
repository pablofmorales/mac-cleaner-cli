import { describe, it, expect } from "vitest";
import { clean } from "./maintain.js";

describe("maintain cleaner", () => {
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

  it("dry-run freed is always 0 (maintenance frees no disk space)", async () => {
    const result = await clean({ dryRun: true, json: true });
    expect(result.freed).toBe(0);
  });

  it("paths contain task labels, not file paths", async () => {
    const result = await clean({ dryRun: true, json: true });
    // Maintenance tasks return labels like "Flush DNS cache", not file paths
    for (const p of result.paths) {
      expect(p).not.toMatch(/^\//);
    }
  });

  it("skips sudo tasks when noSudo is set", async () => {
    const result = await clean({ dryRun: true, json: true, noSudo: true });

    // Should not include sudo-only tasks
    const sudoTasks = ["Restart mDNSResponder", "Rebuild Spotlight index", "Purge inactive memory", "Clear font caches"];
    for (const task of sudoTasks) {
      expect(result.paths).not.toContain(task);
    }
    expect(result.ok).toBe(true);
  });
});
