import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";
import { renderSummaryTable, verboseLine, truncatePath } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

const home = os.homedir();

const MOBILE_SYNC_DIR = path.join(home, "Library", "Application Support", "MobileSync");
const BACKUP_DIR = path.join(MOBILE_SYNC_DIR, "Backup");
const ARCHIVABLE_DIR = path.join(MOBILE_SYNC_DIR, "Archivable");

interface BackupInfo {
  path: string;
  deviceName: string;
  date: string | null;
  size: number;
}

/**
 * Reads a plist key using `defaults read`. Returns null on failure.
 */
function readPlistKey(plistPath: string, key: string): string | null {
  const result = spawnSync("defaults", ["read", plistPath, key], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.trim();
}

/**
 * Attempts to identify a backup directory by reading its plist metadata.
 */
function identifyBackup(backupPath: string): BackupInfo {
  const size = duBytes(backupPath);
  const dirName = path.basename(backupPath);

  // Try Info.plist first, then Manifest.plist
  const infoPlist = path.join(backupPath, "Info.plist");
  const manifestPlist = path.join(backupPath, "Manifest.plist");

  let deviceName = dirName; // fallback to directory name
  let date: string | null = null;

  if (fs.existsSync(infoPlist)) {
    const name = readPlistKey(infoPlist, "Device Name");
    if (name) deviceName = name;
    const lastBackup = readPlistKey(infoPlist, "Last Backup Date");
    if (lastBackup) date = lastBackup;
  } else if (fs.existsSync(manifestPlist)) {
    // Manifest.plist may not have device name but is worth checking
    const name = readPlistKey(manifestPlist, "Device Name");
    if (name) deviceName = name;
  }

  return { path: backupPath, deviceName, date, size };
}

/**
 * Lists all backup subdirectories, each representing one device backup.
 */
function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const backups: BackupInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(BACKUP_DIR, entry.name);
    backups.push(identifyBackup(fullPath));
  }

  return backups;
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : createSpinner("Scanning iOS/mobile backups...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  const backups = listBackups();

  // Also check for Archivable directory
  const archivableExists = fs.existsSync(ARCHIVABLE_DIR);
  const archivableSize = archivableExists ? duBytes(ARCHIVABLE_DIR) : 0;

  if (backups.length === 0 && !archivableExists) {
    if (spinner) spinner.info("No iOS/mobile backups found");
    return { ok: true, paths: [], freed: 0, errors };
  }

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));

    for (const backup of backups) {
      if (options.verbose && !options.json) {
        const dateStr = backup.date ? chalk.gray(` (${backup.date})`) : "";
        verboseLine(`${backup.deviceName}${dateStr}`, backup.path, backup.size, true);
      }
      cleanedPaths.push(backup.path);
      freed += backup.size;
    }

    if (archivableExists) {
      if (options.verbose && !options.json) {
        verboseLine("Archivable", ARCHIVABLE_DIR, archivableSize, true);
      }
      cleanedPaths.push(ARCHIVABLE_DIR);
      freed += archivableSize;
    }

    if (!options.json && !(options as any)._suppressTable) {
      renderSummaryTable([{ module: "iOS Backups", paths: cleanedPaths.length, freed, status: "would_free", warnings: errors.length }], true);
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  // Real deletion
  if (spinner) spinner.text = `Cleaning ${backups.length} iOS backup(s)...`;

  for (const backup of backups) {
    if (spinner) spinner.text = `[${backup.deviceName}] Cleaning: ${truncatePath(backup.path)}`;
    try {
      fs.rmSync(backup.path, { recursive: true, force: true });
      cleanedPaths.push(backup.path);
      freed += backup.size;
      if (options.verbose && !options.json) {
        const dateStr = backup.date ? chalk.gray(` (${backup.date})`) : "";
        verboseLine(`${backup.deviceName}${dateStr}`, backup.path, backup.size, false);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("EPERM") || msg.includes("EACCES")) {
        errors.push(`Skipped (protected by macOS): ${backup.path}`);
      } else {
        errors.push(`Failed to remove ${backup.path}: ${msg}`);
      }
    }
  }

  if (archivableExists) {
    if (spinner) spinner.text = `Cleaning: ${truncatePath(ARCHIVABLE_DIR)}`;
    try {
      fs.rmSync(ARCHIVABLE_DIR, { recursive: true, force: true });
      cleanedPaths.push(ARCHIVABLE_DIR);
      freed += archivableSize;
      if (options.verbose && !options.json) {
        verboseLine("Archivable", ARCHIVABLE_DIR, archivableSize, false);
      }
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`Failed to remove ${ARCHIVABLE_DIR}: ${msg}`);
    }
  }

  if (spinner) spinner.succeed(chalk.green("iOS/mobile backups cleaned"));

  if (!options.json && !(options as any)._suppressTable) {
    renderSummaryTable([{ module: "iOS Backups", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length }]);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  // Audit log
  writeAuditLog({
    command: "clean mobile-backups",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose, secureDelete: options.secureDelete },
    paths_deleted: cleanedPaths,
    bytes_freed: freed,
    errors,
  });

  return { ok: true, paths: cleanedPaths, freed, errors };
}
