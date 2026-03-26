import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { formatBytes } from "../utils/du.js";
import { renderSummaryTable, SummaryRow, verboseLine, truncatePath } from "../utils/format.js";
import { isSafeToDelete } from "../utils/safeDelete.js";
import { writeAuditLog } from "../utils/auditLog.js";

const home = os.homedir();

/** Directories to scan by default */
const SCAN_DIRS = [
  path.join(home, "Downloads"),
  path.join(home, "Desktop"),
  path.join(home, "Documents"),
];

/** Directory names to skip during traversal */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".Trash",
  "Library",
  ".npm",
  ".cache",
  ".local",
]);

/** Default minimum file size: 100 MB */
const DEFAULT_MIN_SIZE = 100 * 1024 * 1024;

/** Default age threshold: 90 days */
const DEFAULT_OLDER_THAN_DAYS = 90;

interface LargeFile {
  filePath: string;
  size: number;
  atime: Date;
}

/**
 * Parse a human-readable size string (e.g. "100M", "1G", "500K") into bytes.
 * Falls back to DEFAULT_MIN_SIZE on invalid input.
 */
function parseSize(sizeStr: string): number {
  const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*([KMGT]?)B?$/i);
  if (!match) return DEFAULT_MIN_SIZE;
  const value = parseFloat(match[1]);
  const unit = (match[2] || "").toUpperCase();
  const multipliers: Record<string, number> = {
    "": 1,
    K: 1024,
    M: 1024 * 1024,
    G: 1024 * 1024 * 1024,
    T: 1024 * 1024 * 1024 * 1024,
  };
  return Math.floor(value * (multipliers[unit] ?? 1));
}

/**
 * Recursively walk a directory tree, collecting files that exceed the
 * size threshold and haven't been accessed within the age threshold.
 * Skips dotfiles, node_modules, .git, Library, and other excluded dirs.
 */
function walkDir(
  dir: string,
  minSize: number,
  cutoffDate: Date,
  results: LargeFile[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // Permission denied or missing directory -- skip silently
    return;
  }

  for (const entry of entries) {
    const name = entry.name;

    // Skip dotfiles and excluded directories
    if (name.startsWith(".")) continue;
    if (SKIP_DIRS.has(name)) continue;

    const fullPath = path.join(dir, name);

    if (entry.isDirectory()) {
      walkDir(fullPath, minSize, cutoffDate, results);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size >= minSize && stat.atime < cutoffDate) {
          results.push({ filePath: fullPath, size: stat.size, atime: stat.atime });
        }
      } catch {
        // Permission denied or race condition -- skip
      }
    }
  }
}

/**
 * Format a Date as a short YYYY-MM-DD string.
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Get a human-readable file type based on extension.
 */
function fileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".zip": "Archive",
    ".tar": "Archive",
    ".gz": "Archive",
    ".bz2": "Archive",
    ".xz": "Archive",
    ".7z": "Archive",
    ".rar": "Archive",
    ".dmg": "Disk Image",
    ".iso": "Disk Image",
    ".pkg": "Installer",
    ".app": "Application",
    ".mp4": "Video",
    ".mov": "Video",
    ".mkv": "Video",
    ".avi": "Video",
    ".wmv": "Video",
    ".mp3": "Audio",
    ".wav": "Audio",
    ".flac": "Audio",
    ".aac": "Audio",
    ".pdf": "Document",
    ".doc": "Document",
    ".docx": "Document",
    ".xls": "Spreadsheet",
    ".xlsx": "Spreadsheet",
    ".csv": "Data",
    ".json": "Data",
    ".psd": "Image",
    ".ai": "Image",
    ".png": "Image",
    ".jpg": "Image",
    ".jpeg": "Image",
    ".tiff": "Image",
    ".raw": "Image",
    ".log": "Log",
    ".sql": "Database",
    ".sqlite": "Database",
    ".db": "Database",
    ".vmdk": "Virtual Disk",
    ".vdi": "Virtual Disk",
    ".qcow2": "Virtual Disk",
  };
  return types[ext] ?? "File";
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const suppressTable = (options as any)._suppressTable === true;
  const spinner = options.json ? null : createSpinner("Scanning for large & old files...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // Read extended options for thresholds
  const minSizeStr: string = (options as any).minSize ?? "100M";
  const olderThanDays: number = parseInt((options as any).olderThan ?? "90", 10) || DEFAULT_OLDER_THAN_DAYS;

  const minSize = parseSize(minSizeStr);
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  // Collect large & old files
  const found: LargeFile[] = [];
  for (const dir of SCAN_DIRS) {
    if (fs.existsSync(dir)) {
      walkDir(dir, minSize, cutoffDate, found);
    }
  }

  // Sort by size descending
  found.sort((a, b) => b.size - a.size);

  if (found.length === 0) {
    if (spinner) spinner.info(`No files found over ${formatBytes(minSize)} older than ${olderThanDays} days`);
    return { ok: true, paths: [], freed: 0, errors };
  }

  if (spinner) spinner.text = `Found ${found.length} large file(s) to review`;

  // ── Dry run ──────────────────────────────────────────────────────────────
  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run -- nothing deleted"));

    for (const f of found) {
      if (options.verbose && !options.json) {
        const type = fileType(f.filePath);
        const dateStr = formatDate(f.atime);
        console.log(
          `  ${chalk.yellow("[dry-run]")} ${chalk.gray(type.padEnd(14))} ${truncatePath(f.filePath)} ` +
          `${chalk.gray(`(${formatBytes(f.size)}, last accessed ${dateStr})`)}`
        );
      }
      cleanedPaths.push(f.filePath);
      freed += f.size;
    }

    if (!options.json && !suppressTable) {
      renderSummaryTable([{
        module: "Large Files",
        paths: cleanedPaths.length,
        freed,
        status: "would_free",
        warnings: 0,
      }], true);
    }

    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  // ── Real mode ─────────────────────────────────────────────────────────────
  if (spinner) spinner.text = "Removing large & old files...";

  for (const f of found) {
    if (spinner) spinner.text = `Removing: ${truncatePath(f.filePath)}`;

    // Safety check: only delete files inside home directory
    if (!isSafeToDelete(f.filePath, home)) {
      errors.push(`Skipped (symlink escape detected): ${f.filePath}`);
      continue;
    }

    try {
      // Secure delete support
      if (options.secureDelete && process.platform === "darwin") {
        try {
          const stat = fs.statSync(f.filePath);
          if (stat.isFile() && stat.size > 0) {
            if (options.verbose && !options.json) {
              console.log(chalk.gray(`    [secure-delete] overwriting ${f.filePath}`));
            }
            fs.writeFileSync(f.filePath, Buffer.alloc(stat.size));
          }
        } catch { /* best-effort */ }
      }

      fs.rmSync(f.filePath, { force: true });
      cleanedPaths.push(f.filePath);
      freed += f.size;

      if (options.verbose && !options.json) {
        verboseLine("large-files", f.filePath, f.size, false);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("EPERM") || msg.includes("EACCES")) {
        errors.push(`Skipped (permission denied): ${f.filePath}`);
      } else {
        errors.push(`Failed to remove ${f.filePath}: ${msg}`);
      }
    }
  }

  if (spinner) spinner.succeed(chalk.green("Large & old files cleaned"));

  if (!options.json && !suppressTable) {
    renderSummaryTable([{
      module: "Large Files",
      paths: cleanedPaths.length,
      freed,
      status: "freed",
      warnings: errors.length,
    }]);
  }

  if (errors.length > 0 && !options.json && options.verbose) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  // Audit log
  writeAuditLog({
    command: "clean large-files",
    options: {
      dryRun: options.dryRun,
      json: options.json,
      verbose: options.verbose,
      secureDelete: options.secureDelete,
      minSize: minSizeStr,
      olderThan: olderThanDays,
    },
    paths_deleted: cleanedPaths,
    bytes_freed: freed,
    errors,
  });

  return { ok: true, paths: cleanedPaths, freed, errors };
}
