import { describe, it, expect } from "vitest";
import { clean } from "./docker.js";

// Docker test can be slow in CI because spawnSync('which', ['docker']) has a 5s timeout
// and Docker daemon check can also take time. Set a generous timeout for all tests here.
describe("docker cleaner", () => {
  it("returns ok:true even when Docker is not installed", async () => {
    const result = await clean({ dryRun: true, json: true });
    expect(result.ok).toBe(true);
  }, 15000);

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
  }, 15000);
});
