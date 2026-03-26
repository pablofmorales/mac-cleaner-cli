import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes } from "../utils/du.js";
import { renderSummaryTable, verboseLine, truncatePath } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

const home = os.homedir();

/**
 * Directories under ~/Library that may hold app leftovers.
 *
 * Each entry maps a Library subdirectory to the type of identifier
 * used in that directory:
 *   - "name"     = plain app name (e.g. "Slack")
 *   - "bundleId" = reverse-DNS bundle identifier (e.g. "com.tinyspeck.slackmacgap")
 */
const LIBRARY_LOCATIONS: Array<{ dir: string; matchBy: "name" | "bundleId" }> = [
  { dir: path.join(home, "Library", "Application Support"), matchBy: "name" },
  { dir: path.join(home, "Library", "Preferences"),         matchBy: "bundleId" },
  { dir: path.join(home, "Library", "Caches"),              matchBy: "name" },
  { dir: path.join(home, "Library", "Containers"),          matchBy: "bundleId" },
  { dir: path.join(home, "Library", "Saved Application State"), matchBy: "bundleId" },
  { dir: path.join(home, "Library", "HTTPStorages"),        matchBy: "bundleId" },
  { dir: path.join(home, "Library", "WebKit"),              matchBy: "bundleId" },
  { dir: path.join(home, "Library", "Logs"),                matchBy: "name" },
  { dir: path.join(home, "Library", "Cookies"),             matchBy: "bundleId" },
];

/**
 * Reads CFBundleIdentifier, CFBundleName, and CFBundleDisplayName from an
 * app's Info.plist in a single process spawn using `plutil -convert json`.
 * Returns null values when the plist is unreadable.
 */
function readPlistInfo(appPath: string): { bundleId: string | null; bundleName: string | null } {
  const plist = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(plist)) return { bundleId: null, bundleName: null };

  const result = spawnSync("plutil", ["-convert", "json", "-o", "-", plist], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status !== 0 || !result.stdout) return { bundleId: null, bundleName: null };

  try {
    const info = JSON.parse(result.stdout) as Record<string, unknown>;
    const bundleId = typeof info.CFBundleIdentifier === "string" ? info.CFBundleIdentifier : null;
    const bundleName =
      (typeof info.CFBundleName === "string" && info.CFBundleName) ||
      (typeof info.CFBundleDisplayName === "string" && info.CFBundleDisplayName) ||
      null;
    return { bundleId, bundleName };
  } catch {
    return { bundleId: null, bundleName: null };
  }
}

interface InstalledApp {
  /** Display / bundle name (e.g. "Slack") */
  names: Set<string>;
  /** Reverse-DNS bundle identifier (e.g. "com.tinyspeck.slackmacgap") */
  bundleId: string | null;
}

/**
 * Builds a catalogue of every .app currently in /Applications.
 */
function getInstalledApps(): InstalledApp[] {
  const appsDir = "/Applications";
  if (!fs.existsSync(appsDir)) return [];

  let entries: string[];
  try {
    entries = fs.readdirSync(appsDir).filter((e) => e.endsWith(".app"));
  } catch {
    return [];
  }

  const apps: InstalledApp[] = [];

  for (const entry of entries) {
    const appPath = path.join(appsDir, entry);
    const displayName = entry.replace(/\.app$/, "");
    const { bundleId, bundleName } = readPlistInfo(appPath);

    const names = new Set<string>();
    names.add(displayName.toLowerCase());
    if (bundleName) names.add(bundleName.toLowerCase());

    apps.push({ names, bundleId });
  }

  return apps;
}

/**
 * Returns true when the given directory entry name looks like it belongs
 * to a system framework or Apple service that should never be cleaned.
 */
function isSystemEntry(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.startsWith("com.apple.") ||
    lower.startsWith("com.microsoft.") ||
    lower.startsWith("apple") ||
    lower === ".localized" ||
    lower.startsWith(".")
  );
}

/**
 * Checks whether a directory entry has a matching installed application.
 *
 * For "name" matching the entry is compared (case-insensitive) against the
 * app's display name and CFBundleName.
 *
 * For "bundleId" matching the entry (possibly with a suffix like
 * `.savedState` or `.binarycookies`) is compared against the bundle ID.
 */
function hasMatchingApp(
  entry: string,
  matchBy: "name" | "bundleId",
  installedApps: InstalledApp[],
): boolean {
  if (matchBy === "name") {
    const lower = entry.toLowerCase();
    return installedApps.some((app) => app.names.has(lower));
  }

  // bundleId matching — strip known suffixes first
  let candidate = entry;
  for (const suffix of [".savedState", ".binarycookies", ".plist"]) {
    if (candidate.endsWith(suffix)) {
      candidate = candidate.slice(0, -suffix.length);
      break;
    }
  }

  const lowerCandidate = candidate.toLowerCase();
  return installedApps.some(
    (app) => app.bundleId !== null && app.bundleId.toLowerCase() === lowerCandidate,
  );
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : createSpinner("Scanning for app leftovers...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // 1. Build catalogue of currently-installed apps
  const installedApps = getInstalledApps();

  if (installedApps.length === 0) {
    if (spinner) spinner.info("Could not read /Applications — skipping orphan scan");
    return { ok: true, paths: [], freed: 0, errors };
  }

  // 2. Scan Library locations for orphans
  const orphans: Array<{ location: string; fullPath: string }> = [];

  for (const { dir, matchBy } of LIBRARY_LOCATIONS) {
    if (!fs.existsSync(dir)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (isSystemEntry(entry)) continue;

      if (!hasMatchingApp(entry, matchBy, installedApps)) {
        const fullPath = path.join(dir, entry);
        // Only include directories (or plist/cookie files) — skip stray plain files
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory() || entry.endsWith(".plist") || entry.endsWith(".binarycookies")) {
            orphans.push({ location: dir, fullPath });
          }
        } catch {
          // stat failed — skip silently
        }
      }
    }
  }

  if (orphans.length === 0) {
    if (spinner) spinner.succeed(chalk.green("No orphaned app leftovers found"));
    return { ok: true, paths: [], freed: 0, errors };
  }

  // 3a. Dry-run path
  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));
    for (const { fullPath } of orphans) {
      const size = duBytes(fullPath);
      if (options.verbose && !options.json) {
        verboseLine("Apps", fullPath, size, true);
      }
      cleanedPaths.push(fullPath);
      freed += size;
    }
    if (!options.json && !(options as any)._suppressTable) {
      renderSummaryTable([{ module: "Apps", paths: cleanedPaths.length, freed, status: "would_free", warnings: errors.length }], true);
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  // 3b. Actual deletion
  if (spinner) spinner.text = `Cleaning ${orphans.length} orphaned app leftover paths...`;

  for (const { fullPath } of orphans) {
    if (spinner) spinner.text = `[Apps] Cleaning: ${truncatePath(fullPath)}`;
    const size = duBytes(fullPath);
    try {
      if (options.secureDelete && process.platform === "darwin") {
        let stat: fs.Stats | null = null;
        try { stat = fs.statSync(fullPath); } catch { /* ignore */ }
        if (stat?.isFile() && stat.size > 0) {
          if (options.verbose && !options.json) {
            console.log(chalk.gray(`    [secure-delete] overwriting ${fullPath}`));
          }
          try { fs.writeFileSync(fullPath, Buffer.alloc(stat.size)); } catch { /* best-effort */ }
        }
      }
      fs.rmSync(fullPath, { recursive: true, force: true });
      cleanedPaths.push(fullPath);
      freed += size;
      if (options.verbose && !options.json) {
        verboseLine("Apps", fullPath, size, false);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("EPERM") || msg.includes("EACCES")) {
        errors.push(`Skipped (protected by macOS): ${fullPath}`);
      } else {
        errors.push(`Failed to remove ${fullPath}: ${msg}`);
      }
    }
  }

  if (spinner) spinner.succeed(chalk.green("App leftovers cleaned"));

  if (!options.json && !(options as any)._suppressTable) {
    renderSummaryTable([{ module: "Apps", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length }]);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  writeAuditLog({
    command: "clean apps",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose, secureDelete: options.secureDelete },
    paths_deleted: cleanedPaths,
    bytes_freed: freed,
    errors,
  });

  return { ok: true, paths: cleanedPaths, freed, errors };
}
