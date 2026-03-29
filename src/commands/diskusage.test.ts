import { describe, it, expect, vi, beforeEach } from "vitest";

describe("disk-usage command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runDiskUsage completes without error on /tmp", async () => {
    const { runDiskUsage } = await import("./diskusage.js");
    // /tmp is small and fast to scan
    await expect(runDiskUsage({ json: true, path: "/tmp" })).resolves.toBeUndefined();
  }, 30_000);

  it("JSON output has correct structure", async () => {
    const { runDiskUsage } = await import("./diskusage.js");

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    await runDiskUsage({ json: true, path: "/tmp" });

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);

    expect(parsed).toHaveProperty("ok", true);
    expect(parsed).toHaveProperty("root", "/tmp");
    expect(parsed).toHaveProperty("totalBytes");
    expect(typeof parsed.totalBytes).toBe("number");
    expect(parsed).toHaveProperty("entries");
    expect(Array.isArray(parsed.entries)).toBe(true);

    // Each entry should have path, bytes, percent
    if (parsed.entries.length > 0) {
      const first = parsed.entries[0];
      expect(first).toHaveProperty("path");
      expect(first).toHaveProperty("bytes");
      expect(first).toHaveProperty("percent");
      expect(typeof first.bytes).toBe("number");
      expect(typeof first.percent).toBe("number");
    }

    spy.mockRestore();
  }, 30_000);

  it("accepts a custom path argument and reflects it in output", async () => {
    const { runDiskUsage } = await import("./diskusage.js");

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    await runDiskUsage({ json: true, path: "/var" });

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.ok).toBe(true);
    expect(parsed.root).toBe("/var");

    spy.mockRestore();
  }, 30_000);

  it("entries are sorted by size descending", async () => {
    const { runDiskUsage } = await import("./diskusage.js");

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    await runDiskUsage({ json: true, path: "/tmp" });

    const parsed = JSON.parse(logs[0]);
    const entries = parsed.entries as { bytes: number }[];

    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].bytes).toBeGreaterThanOrEqual(entries[i].bytes);
    }

    spy.mockRestore();
  }, 30_000);
});
