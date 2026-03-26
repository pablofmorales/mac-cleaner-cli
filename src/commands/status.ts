import * as os from "os";
import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { formatBytes } from "../utils/du.js";
import type { CleanOptions, CleanResult } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StatusResult {
  disk: {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
  };
  uptime: {
    seconds: number;
    formatted: string;
  };
  reclaimable: {
    total: number;
    breakdown: { name: string; freed: number }[];
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDiskInfo(): { total: number; used: number; free: number } {
  const result = spawnSync("df", ["-k", "/"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) {
    return { total: 0, used: 0, free: 0 };
  }
  // df -k / output: second line has columns: Filesystem 1024-blocks Used Available Capacity ...
  const lines = result.stdout.trim().split("\n");
  if (lines.length < 2) return { total: 0, used: 0, free: 0 };
  const parts = lines[1].split(/\s+/);
  const total = parseInt(parts[1], 10) * 1024;
  const used = parseInt(parts[2], 10) * 1024;
  const free = parseInt(parts[3], 10) * 1024;
  return { total, used, free };
}

function getMemoryInfo(): { total: number; used: number; free: number } {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return { total, used, free };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return hours > 0 ? `${days} day${days !== 1 ? "s" : ""}, ${hours} hr${hours !== 1 ? "s" : ""}` : `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours} hr${hours !== 1 ? "s" : ""}, ${minutes} min` : `${hours} hr${hours !== 1 ? "s" : ""}`;
  }
  return `${minutes} min`;
}

function renderBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);

  if (percent >= 80) return chalk.red(bar);
  if (percent >= 50) return chalk.yellow(bar);
  return chalk.green(bar);
}

// ─── Reclaimable scan ───────────────────────────────────────────────────────

interface ModuleDef {
  name: string;
  importPath: string;
}

const scanModules: ModuleDef[] = [
  { name: "System caches",  importPath: "../cleaners/system.js" },
  { name: "Browser caches", importPath: "../cleaners/browser.js" },
  { name: "Xcode",          importPath: "../cleaners/xcode.js" },
  { name: "Docker",         importPath: "../cleaners/docker.js" },
  { name: "Node",           importPath: "../cleaners/node.js" },
  { name: "Brew",           importPath: "../cleaners/brew.js" },
];

async function scanReclaimable(): Promise<{ total: number; breakdown: { name: string; freed: number }[] }> {
  const scanOpts: CleanOptions & { _suppressTable?: boolean } = {
    dryRun: true,
    json: true,
    verbose: false,
    noSudo: true,
    yes: true,
    _suppressTable: true,
  };

  const breakdown: { name: string; freed: number }[] = [];

  // Suppress console output during scan
  const origLog = console.log;
  const origWarn = console.warn;

  for (const mod of scanModules) {
    try {
      console.log = () => {};
      console.warn = () => {};
      const cleaner = await import(mod.importPath) as { clean: (opts: CleanOptions) => Promise<CleanResult> };
      const result = await cleaner.clean(scanOpts);
      if (result.freed > 0) {
        breakdown.push({ name: mod.name, freed: result.freed });
      }
    } catch {
      // Graceful degradation: skip modules that fail
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
  }

  const total = breakdown.reduce((sum, item) => sum + item.freed, 0);
  return { total, breakdown };
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function runStatus(opts: { json: boolean }): Promise<StatusResult> {
  const spinner = opts.json ? null : ora("Scanning system health...").start();

  // Gather system info (instant)
  const disk = getDiskInfo();
  const mem = getMemoryInfo();
  const uptimeSec = os.uptime();

  // Scan reclaimable space (may take a few seconds)
  if (spinner) spinner.text = "Estimating reclaimable space...";
  const reclaimable = await scanReclaimable();

  if (spinner) spinner.stop();

  const diskPercent = disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0;
  const memPercent = mem.total > 0 ? Math.round((mem.used / mem.total) * 100) : 0;

  const result: StatusResult = {
    disk: { ...disk, usedPercent: diskPercent },
    memory: { ...mem, usedPercent: memPercent },
    uptime: { seconds: uptimeSec, formatted: formatUptime(uptimeSec) },
    reclaimable,
  };

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, data: result }));
    return result;
  }

  // ─── Render output ──────────────────────────────────────────────────────

  const LABEL_WIDTH = 22;

  console.log();

  // Disk
  const diskLabel = `${chalk.bold("Disk:")}`.padEnd(LABEL_WIDTH);
  const diskUsed = formatBytes(disk.used);
  const diskTotal = formatBytes(disk.total);
  console.log(`  ${diskLabel}${diskUsed} / ${diskTotal} used (${diskPercent}%)  ${renderBar(diskPercent)}`);

  // Memory
  const memLabel = `${chalk.bold("Memory:")}`.padEnd(LABEL_WIDTH);
  const memUsed = formatBytes(mem.used);
  const memTotal = formatBytes(mem.total);
  console.log(`  ${memLabel}${memUsed} / ${memTotal} used         ${renderBar(memPercent)}`);

  // Uptime
  const uptimeLabel = `${chalk.bold("Uptime:")}`.padEnd(LABEL_WIDTH);
  console.log(`  ${uptimeLabel}${formatUptime(uptimeSec)}`);

  // Reclaimable
  if (reclaimable.total > 0) {
    const reclaimLabel = `${chalk.bold("Reclaimable (est):")}`.padEnd(LABEL_WIDTH);
    console.log(`  ${reclaimLabel}${chalk.cyan("~" + formatBytes(reclaimable.total))}`);

    for (const item of reclaimable.breakdown) {
      const itemLabel = `  ${item.name}:`.padEnd(LABEL_WIDTH);
      console.log(`    ${chalk.gray(itemLabel)}${chalk.gray(formatBytes(item.freed))}`);
    }
  } else {
    const reclaimLabel = `${chalk.bold("Reclaimable (est):")}`.padEnd(LABEL_WIDTH);
    console.log(`  ${reclaimLabel}${chalk.green("Nothing to reclaim")}`);
  }

  console.log();
  console.log(chalk.gray("  Run ") + chalk.bold("mac-cleaner all --dry-run") + chalk.gray(" for a detailed breakdown."));
  console.log();

  return result;
}
