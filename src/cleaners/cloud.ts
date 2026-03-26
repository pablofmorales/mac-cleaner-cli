import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";
import { renderSummaryTable, verboseLine, truncatePath } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

const home = os.homedir();

/**
 * Static cache directories that are safe to delete.
 * These are macOS system caches related to cloud sync daemons.
 */
const CLOUD_CACHE_PATHS = [
  path.join(home, "Library", "Caches", "CloudKit"),
  path.join(home, "Library", "Caches", "com.apple.bird"),
  path.join(home, "Library", "Caches", "com.apple.cloudd"),
];

/**
 * Base directory where macOS mounts cloud storage provider folders.
 * Provider directories match patterns like Dropbox, GoogleDrive-*, OneDrive-*.
 */
const CLOUD_STORAGE_BASE = path.join(home, "Library", "CloudStorage");

/**
 * Scan ~/Library/CloudStorage/ for provider folders and return their paths
 * with sizes. These are reported for informational purposes only -- we never
 * delete actual cloud-synced user files.
 */
function discoverProviderFolders(): Array<{ provider: string; dir: string }> {
  const results: Array<{ provider: string; dir: string }> = [];

  if (!fs.existsSync(CLOUD_STORAGE_BASE)) return results;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(CLOUD_STORAGE_BASE, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const name = entry.name;

    let provider: string | null = null;
    if (name === "Dropbox" || name.startsWith("Dropbox-")) provider = "Dropbox";
    else if (name.startsWith("GoogleDrive-")) provider = "Google Drive";
    else if (name.startsWith("OneDrive-")) provider = "OneDrive";
    else if (name.startsWith("iCloudDrive")) provider = "iCloud Drive";

    if (provider) {
      results.push({ provider, dir: path.join(CLOUD_STORAGE_BASE, name) });
    }
  }

  return results;
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : createSpinner("Scanning cloud storage caches...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // 1. Gather deletable cache directories
  const cacheCandidates: Array<{ label: string; path: string }> = [];
  for (const p of CLOUD_CACHE_PATHS) {
    if (fs.existsSync(p)) {
      cacheCandidates.push({ label: path.basename(p), path: p });
    }
  }

  // 2. Discover provider folders (read-only reporting)
  const providers = discoverProviderFolders();

  if (cacheCandidates.length === 0 && providers.length === 0) {
    if (spinner) spinner.info("No cloud storage caches found");
    return { ok: true, paths: [], freed: 0, errors };
  }

  // Report discovered cloud storage providers (informational)
  if (providers.length > 0 && options.verbose && !options.json) {
    for (const { provider, dir } of providers) {
      const size = duBytes(dir);
      console.log(
        chalk.gray(`    [${provider}] ${truncatePath(dir)} ${chalk.cyan(formatBytes(size))} (synced -- not deleted)`),
      );
    }
  }

  // ── Dry-run path ──────────────────────────────────────────────────────────
  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run -- nothing deleted"));
    for (const { label, path: p } of cacheCandidates) {
      const size = duBytes(p);
      if (options.verbose && !options.json) {
        verboseLine(label, p, size, true);
      }
      cleanedPaths.push(p);
      freed += size;
    }
    if (!options.json && !(options as any)._suppressTable) {
      renderSummaryTable([{ module: "Cloud", paths: cleanedPaths.length, freed, status: "would_free", warnings: errors.length }], true);
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  // ── Actual clean ──────────────────────────────────────────────────────────
  if (spinner) spinner.text = `Cleaning ${cacheCandidates.length} cloud cache paths...`;

  for (const { label, path: p } of cacheCandidates) {
    if (spinner) spinner.text = `[${label}] Cleaning: ${truncatePath(p)}`;
    const size = duBytes(p);
    try {
      if (options.secureDelete && process.platform === "darwin") {
        let stat: fs.Stats | null = null;
        try { stat = fs.statSync(p); } catch { /* ignore */ }
        if (stat?.isFile()) {
          if (options.verbose && !options.json) {
            console.log(chalk.gray(`    [secure-delete] overwriting ${p}`));
          }
          if (stat && stat.size > 0) {
            try { fs.writeFileSync(p, Buffer.alloc(stat.size)); } catch { /* best-effort */ }
          }
        }
      }
      fs.rmSync(p, { recursive: true, force: true });
      cleanedPaths.push(p);
      freed += size;
      if (options.verbose && !options.json) {
        verboseLine(label, p, size, false);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("EPERM") || msg.includes("EACCES")) {
        errors.push(`Skipped (protected by macOS): ${p}`);
      } else {
        errors.push(`Failed to remove ${p}: ${msg}`);
      }
    }
  }

  if (spinner) spinner.succeed(chalk.green("Cloud storage caches cleaned"));

  if (!options.json && !(options as any)._suppressTable) {
    renderSummaryTable([{ module: "Cloud", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length }]);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  // Audit log
  writeAuditLog({
    command: "clean cloud",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose, secureDelete: options.secureDelete },
    paths_deleted: cleanedPaths,
    bytes_freed: freed,
    errors,
  });

  return { ok: true, paths: cleanedPaths, freed, errors };
}
