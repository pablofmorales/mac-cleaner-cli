import { describe, it, expect } from "vitest";
import * as os from "os";
import { clean } from "./mobile.js";

describe("mobile cleaner", () => {
  it("returns ok:true in dry-run even if no backups exist", async () => {
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

  it("paths use os.homedir() dynamically", async () => {
    const result = await clean({ dryRun: true, json: true });
    const home = os.homedir();

    for (const p of result.paths) {
      if (p.includes("/Users/") || p.includes("/home/")) {
        expect(p.startsWith(home)).toBe(true);
      }
    }
  });
});
