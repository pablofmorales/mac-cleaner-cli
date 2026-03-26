import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runStatus, StatusResult } from "./status.js";

describe("status command", () => {
  let origLog: typeof console.log;
  let captured: string[];

  beforeEach(() => {
    origLog = console.log;
    captured = [];
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = origLog;
  });

  it("runs without error and returns a StatusResult", async () => {
    const result = await runStatus({ json: true });

    expect(result).toHaveProperty("disk");
    expect(result).toHaveProperty("memory");
    expect(result).toHaveProperty("uptime");
    expect(result).toHaveProperty("reclaimable");
  }, 30_000);

  it("JSON output has correct structure", async () => {
    const result = await runStatus({ json: true });

    // Find the JSON output line
    const jsonLine = captured.find((line) => line.startsWith("{"));
    expect(jsonLine).toBeDefined();

    const parsed = JSON.parse(jsonLine!);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toHaveProperty("disk");
    expect(parsed.data).toHaveProperty("memory");
    expect(parsed.data).toHaveProperty("uptime");
    expect(parsed.data).toHaveProperty("reclaimable");

    // Disk
    expect(typeof parsed.data.disk.total).toBe("number");
    expect(typeof parsed.data.disk.used).toBe("number");
    expect(typeof parsed.data.disk.free).toBe("number");
    expect(typeof parsed.data.disk.usedPercent).toBe("number");
    expect(parsed.data.disk.total).toBeGreaterThan(0);

    // Memory
    expect(typeof parsed.data.memory.total).toBe("number");
    expect(typeof parsed.data.memory.used).toBe("number");
    expect(typeof parsed.data.memory.free).toBe("number");
    expect(typeof parsed.data.memory.usedPercent).toBe("number");
    expect(parsed.data.memory.total).toBeGreaterThan(0);

    // Uptime
    expect(typeof parsed.data.uptime.seconds).toBe("number");
    expect(typeof parsed.data.uptime.formatted).toBe("string");
    expect(parsed.data.uptime.seconds).toBeGreaterThan(0);

    // Reclaimable
    expect(typeof parsed.data.reclaimable.total).toBe("number");
    expect(Array.isArray(parsed.data.reclaimable.breakdown)).toBe(true);
  }, 30_000);

  it("non-JSON mode produces human-readable output", async () => {
    await runStatus({ json: false });

    const output = captured.join("\n");
    expect(output).toContain("Disk:");
    expect(output).toContain("Memory:");
    expect(output).toContain("Uptime:");
    expect(output).toContain("Reclaimable (est):");
  }, 30_000);
});
