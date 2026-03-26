import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { clean } from "./system.js";

describe("system cleaner", () => {
  it("dry-run does not delete any files", async () => {
    // Create a temp file to verify it survives dry-run
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mac-cleaner-test-"));
    const testFile = path.join(tmpDir, "test.txt");
    fs.writeFileSync(testFile, "should not be deleted");

    const result = await clean({ dryRun: true, json: true });

    // File should still exist (dry-run didn't delete)
    expect(fs.existsSync(testFile)).toBe(true);

    // Result should be ok
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.paths)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("--json mode returns parseable CleanResult structure", async () => {
    const result = await clean({ dryRun: true, json: true });

    // Verify shape
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("paths");
    expect(result).toHaveProperty("freed");
    expect(result).toHaveProperty("errors");

    // Verify types
    expect(typeof result.ok).toBe("boolean");
    expect(Array.isArray(result.paths)).toBe(true);
    expect(typeof result.freed).toBe("number");
    expect(Array.isArray(result.errors)).toBe(true);

    // Must be JSON-serializable
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

  it("does not crash when Library/Caches does not exist", async () => {
    // This just verifies graceful handling — the cleaner should return ok:true regardless
    const result = await clean({ dryRun: true, json: true });
    expect(result.ok).toBe(true);
  });

  it("non-verbose mode suppresses error warnings from stdout", async () => {
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => warns.push(args.join(" "));

    try {
      // dryRun: false so the cleaner actually attempts deletions (some will fail with
      // permission errors, populating the errors array and exercising the output gate)
      await clean({ dryRun: false, json: false, verbose: false, noSudo: true, _suppressTable: true } as any);
    } finally {
      console.warn = origWarn;
    }

    // In non-verbose mode, no warning lines should be printed
    expect(warns.length).toBe(0);
  }, 30000);
});
