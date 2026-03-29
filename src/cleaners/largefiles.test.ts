import { describe, it, expect } from "vitest";
import * as os from "os";
import { clean } from "./largefiles.js";

describe("largefiles cleaner", () => {
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

  it("paths use os.homedir() dynamically (not hardcoded)", async () => {
    const result = await clean({ dryRun: true, json: true });
    const home = os.homedir();

    for (const p of result.paths) {
      if (p.startsWith("/Users/") || p.startsWith("/home/")) {
        expect(p.startsWith(home)).toBe(true);
      }
    }
  });

  it("dry-run returns freed >= 0", async () => {
    const result = await clean({ dryRun: true, json: true });
    expect(result.freed).toBeGreaterThanOrEqual(0);
  });

  it("respects custom minSize and olderThan thresholds", async () => {
    // Use a very large threshold so nothing matches
    const result = await clean({
      dryRun: true,
      json: true,
      minSize: "999T",
      olderThan: "1",
    } as any);
    expect(result.ok).toBe(true);
    expect(result.paths.length).toBe(0);
    expect(result.freed).toBe(0);
  });
});
