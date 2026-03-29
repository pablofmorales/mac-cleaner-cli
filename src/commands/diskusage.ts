import { spawnSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import ora from "ora";
import { formatBytes } from "../utils/du.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DirEntry {
  path: string;
  bytes: number;
  percent: number;
  children?: DirEntry[];
}

export interface DiskUsageResult {
  ok: boolean;
  root: string;
  totalBytes: number;
  entries: DirEntry[];
}

export interface DiskUsageOptions {
  json: boolean;
  path?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BAR_WIDTH = 24;
const FILLED = "\u2588"; // █
const EMPTY = "\u2591";  // ░

/** Default top-level directories to scan under ~ */
const DEFAULT_DIRS = [
  "Library",
  "Downloads",
  "Documents",
  "Desktop",
  "Pictures",
  "Music",
  "Movies",
  "Applications",
  ".Trash",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get the size of a directory in bytes using `du -sk`.
 * Returns 0 if the path does not exist or du fails.
 */
function duSizeBytes(targetPath: string): number {
  if (!existsSync(targetPath)) return 0;
  const result = spawnSync("du", ["-sk", targetPath], {
    encoding: "utf8",
    timeout: 30_000,
    // Suppress stderr (permission errors on unreadable dirs)
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0 || !result.stdout) return 0;
  const kb = parseInt(result.stdout.split("\t")[0], 10);
  if (isNaN(kb)) return 0;
  return kb * 1024;
}

/**
 * List first-level subdirectories of a given path.
 * Returns only directories (not files), sorted alphabetically.
 */
function listSubdirs(parentPath: string): string[] {
  try {
    return readdirSync(parentPath)
      .map((name) => join(parentPath, name))
      .filter((full) => {
        try {
          return statSync(full).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * Render a colored bar: green < 10%, yellow < 30%, red >= 30%.
 */
function renderBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const barStr = FILLED.repeat(filled) + EMPTY.repeat(empty);

  if (percent < 10) return chalk.green(barStr);
  if (percent < 30) return chalk.yellow(barStr);
  return chalk.red(barStr);
}

/**
 * Format a single line of the disk usage table.
 */
function formatLine(label: string, bytes: number, percent: number, indent: boolean): string {
  const prefix = indent ? "  " : "";
  const displayPath = prefix + label;
  const sizeStr = formatBytes(bytes);
  const pctStr = `${Math.round(percent)}%`;

  // Pad columns for alignment
  const pathCol = displayPath.padEnd(indent ? 38 : 36);
  const sizeCol = sizeStr.padStart(10);
  const bar = renderBar(percent);
  const pctCol = pctStr.padStart(5);

  return `${pathCol} ${sizeCol}  ${bar}  ${pctCol}`;
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function runDiskUsage(opts: DiskUsageOptions): Promise<void> {
  const root = opts.path ?? homedir();
  const spinner = opts.json ? null : ora("Scanning disk usage...").start();

  // Determine which top-level dirs to scan
  let topDirs: string[];
  if (opts.path) {
    // Custom path: scan its first-level subdirectories
    topDirs = listSubdirs(root);
  } else {
    // Default: scan well-known home subdirectories
    topDirs = DEFAULT_DIRS.map((d) => join(root, d)).filter((p) => existsSync(p));
  }

  // Gather sizes for top-level directories
  const entries: DirEntry[] = [];
  for (const dir of topDirs) {
    const bytes = duSizeBytes(dir);
    if (bytes === 0) continue;
    entries.push({ path: dir, bytes, percent: 0, children: [] });
  }

  // Sort descending by size
  entries.sort((a, b) => b.bytes - a.bytes);

  // Compute total
  const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);

  // Set percentages
  for (const entry of entries) {
    entry.percent = totalBytes > 0 ? (entry.bytes / totalBytes) * 100 : 0;
  }

  // Gather one level of subdirectories for each top-level entry
  for (const entry of entries) {
    const subdirs = listSubdirs(entry.path);
    const children: DirEntry[] = [];
    for (const sub of subdirs) {
      const bytes = duSizeBytes(sub);
      if (bytes === 0) continue;
      const percent = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0;
      children.push({ path: sub, bytes, percent });
    }
    children.sort((a, b) => b.bytes - a.bytes);
    // Only keep the top 5 subdirectories to avoid clutter
    entry.children = children.slice(0, 5);
  }

  if (spinner) spinner.stop();

  // ─── Output ─────────────────────────────────────────────────────────────

  if (opts.json) {
    const result: DiskUsageResult = { ok: true, root, totalBytes, entries };
    console.log(JSON.stringify(result));
    return;
  }

  // Header
  console.log();
  console.log(chalk.bold("  Space Lens") + chalk.gray(` -- ${root}`));
  console.log(chalk.gray(`  Total scanned: ${formatBytes(totalBytes)}`));
  console.log();

  // Table
  for (const entry of entries) {
    const label = entry.path.startsWith(homedir())
      ? "~/" + entry.path.slice(homedir().length + 1)
      : entry.path;
    console.log(formatLine(label, entry.bytes, entry.percent, false));

    if (entry.children) {
      for (const child of entry.children) {
        const childLabel = child.path.startsWith(homedir())
          ? "~/" + child.path.slice(homedir().length + 1)
          : child.path;
        console.log(formatLine(childLabel, child.bytes, child.percent, true));
      }
    }
  }

  console.log();
}
