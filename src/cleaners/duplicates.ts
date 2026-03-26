import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { formatBytes } from "../utils/du.js";
import { renderSummaryTable, SummaryRow, verboseLine } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

// ── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_SCAN_PATHS = [
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Desktop"),
];

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const PARTIAL_READ_BYTES = 4096; // 4 KB

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a human-readable size string (e.g. "1M", "500K", "1G") into bytes. */
function parseMinSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([bkmgt]?)$/i);
  if (!match) return 1024 * 1024; // fallback: 1 MB
  const value = parseFloat(match[1]);
  const unit = (match[2] || "b").toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    K: 1024,
    M: 1024 * 1024,
    G: 1024 * 1024 * 1024,
    T: 1024 * 1024 * 1024 * 1024,
  };
  return Math.floor(value * (multipliers[unit] ?? 1));
}

/** Recursively walk directories collecting file paths. Skips dotfiles, symlinks, and ignored dirs. */
function walkDir(dir: string, minSize: number, files: Map<number, string[]>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // permission denied or gone — skip silently
  }

  for (const entry of entries) {
    // Skip dotfiles and ignored directories
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkDir(fullPath, minSize, files);
    } else if (entry.isFile()) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.size < minSize) continue;

      const sizeKey = stat.size;
      const group = files.get(sizeKey);
      if (group) {
        group.push(fullPath);
      } else {
        files.set(sizeKey, [fullPath]);
      }
    }
  }
}

/** Read the first PARTIAL_READ_BYTES of a file and return a hex digest. */
function partialHash(filePath: string): string | null {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(PARTIAL_READ_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, PARTIAL_READ_BYTES, 0);
    const hash = createHash("sha256");
    hash.update(buf.subarray(0, bytesRead));
    return hash.digest("hex");
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/** Compute full SHA-256 hash of a file using a stream. */
function fullHash(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const hash = createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk: Buffer) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

// ── Duplicate group type ─────────────────────────────────────────────────────

interface DuplicateGroup {
  hash: string;
  size: number; // size of each file
  files: string[]; // all files with this content
}

// ── Main cleaner ─────────────────────────────────────────────────────────────

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const suppressTable = (options as any)._suppressTable === true;
  const minSizeStr: string = (options as any).minSize ?? "1M";
  const minSize = parseMinSize(minSizeStr);

  const spinner = options.json ? null : createSpinner("Scanning for duplicate files...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // ── Phase 1: Walk directories and group files by size ──────────────────

  if (spinner) spinner.text = "Phase 1/3: Indexing files by size...";

  const filesBySize = new Map<number, string[]>();

  for (const scanDir of DEFAULT_SCAN_PATHS) {
    if (!fs.existsSync(scanDir)) continue;
    walkDir(scanDir, minSize, filesBySize);
  }

  // Remove unique sizes (can't be duplicates)
  const sameSizeGroups: Array<[number, string[]]> = [];
  for (const [size, paths] of filesBySize) {
    if (paths.length >= 2) {
      sameSizeGroups.push([size, paths]);
    }
  }

  if (sameSizeGroups.length === 0) {
    if (spinner) spinner.info("No duplicate candidates found");
    return { ok: true, paths: [], freed: 0, errors };
  }

  // ── Phase 2: Partial hash comparison (first 4 KB) ─────────────────────

  if (spinner) spinner.text = `Phase 2/3: Comparing first 4KB of ${sameSizeGroups.reduce((n, [, p]) => n + p.length, 0)} files...`;

  const partialGroups = new Map<string, string[]>(); // key: "size:partialHash"

  for (const [size, paths] of sameSizeGroups) {
    for (const p of paths) {
      const ph = partialHash(p);
      if (!ph) continue;
      const key = `${size}:${ph}`;
      const group = partialGroups.get(key);
      if (group) {
        group.push(p);
      } else {
        partialGroups.set(key, [p]);
      }
    }
  }

  // Remove groups with only one file (partial hash was unique)
  const partialMatches: Array<[string, string[]]> = [];
  for (const [key, paths] of partialGroups) {
    if (paths.length >= 2) {
      partialMatches.push([key, paths]);
    }
  }

  if (partialMatches.length === 0) {
    if (spinner) spinner.info("No duplicates found after partial comparison");
    return { ok: true, paths: [], freed: 0, errors };
  }

  // ── Phase 3: Full SHA-256 hash for remaining candidates ───────────────

  if (spinner) spinner.text = `Phase 3/3: Computing full SHA-256 for ${partialMatches.reduce((n, [, p]) => n + p.length, 0)} candidates...`;

  const fullGroups = new Map<string, string[]>(); // key: full SHA-256

  for (const [, paths] of partialMatches) {
    for (const p of paths) {
      const fh = await fullHash(p);
      if (!fh) continue;
      const group = fullGroups.get(fh);
      if (group) {
        group.push(p);
      } else {
        fullGroups.set(fh, [p]);
      }
    }
  }

  // Build duplicate groups (keep only groups with 2+ files)
  const duplicates: DuplicateGroup[] = [];
  for (const [hash, files] of fullGroups) {
    if (files.length >= 2) {
      // Get file size from the first file
      let size = 0;
      try {
        size = fs.statSync(files[0]).size;
      } catch { /* skip */ }
      duplicates.push({ hash, size, files });
    }
  }

  // Sort by total reclaimable space (descending)
  duplicates.sort((a, b) => {
    const aReclaimable = a.size * (a.files.length - 1);
    const bReclaimable = b.size * (b.files.length - 1);
    return bReclaimable - aReclaimable;
  });

  if (duplicates.length === 0) {
    if (spinner) spinner.info("No duplicates confirmed after full hash comparison");
    return { ok: true, paths: [], freed: 0, errors };
  }

  // ── Report / Delete ────────────────────────────────────────────────────

  const totalGroups = duplicates.length;
  const totalDuplicates = duplicates.reduce((n, g) => n + (g.files.length - 1), 0);
  const totalReclaimable = duplicates.reduce((n, g) => n + g.size * (g.files.length - 1), 0);

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow(`Dry run -- found ${totalGroups} duplicate group(s), ${totalDuplicates} copies (${formatBytes(totalReclaimable)} reclaimable)`));

    for (const group of duplicates) {
      // Keep first file, mark rest as duplicates
      const copies = group.files.slice(1);
      for (const p of copies) {
        if (options.verbose && !options.json) {
          verboseLine("dup", p, group.size, true);
        }
        cleanedPaths.push(p);
        freed += group.size;
      }

      if (options.verbose && !options.json) {
        console.log(chalk.gray(`    kept: ${group.files[0]}`));
      }
    }

    if (!options.json && !suppressTable) {
      const rows: SummaryRow[] = [
        { module: "Duplicates", paths: cleanedPaths.length, freed, status: "would_free", warnings: errors.length },
      ];
      renderSummaryTable(rows, true);
    }

    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  // ── Real deletion mode ─────────────────────────────────────────────────

  if (spinner) spinner.text = `Removing ${totalDuplicates} duplicate file(s)...`;

  for (const group of duplicates) {
    // Keep the first file in each group, delete the rest
    const copies = group.files.slice(1);
    for (const p of copies) {
      try {
        fs.rmSync(p, { force: true });
        cleanedPaths.push(p);
        freed += group.size;
        if (options.verbose && !options.json) {
          verboseLine("dup", p, group.size, false);
        }
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("EPERM") || msg.includes("EACCES")) {
          errors.push(`Skipped (permission denied): ${p}`);
        } else {
          errors.push(`Failed to remove ${p}: ${msg}`);
        }
      }
    }
  }

  if (spinner) spinner.succeed(chalk.green(`Removed ${cleanedPaths.length} duplicate file(s), freed ${formatBytes(freed)}`));

  if (!options.json && !suppressTable) {
    const rows: SummaryRow[] = [
      { module: "Duplicates", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length },
    ];
    renderSummaryTable(rows);
  }

  if (errors.length > 0 && !options.json && options.verbose) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ! ${e}`));
    }
  }

  // Audit log
  writeAuditLog({
    command: "clean duplicates",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose, minSize: minSizeStr },
    paths_deleted: cleanedPaths,
    bytes_freed: freed,
    errors,
  });

  return { ok: true, paths: cleanedPaths, freed, errors };
}
