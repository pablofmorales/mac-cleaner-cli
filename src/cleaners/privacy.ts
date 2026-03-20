import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes } from "../utils/du.js";
import { renderSummaryTable, verboseLine } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

const home = os.homedir();

/**
 * #47 — Privacy cleaner
 * Removes recent files lists, Finder recents, and XDG recent files.
 */
export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : createSpinner("Scanning privacy targets...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // ── Targets ──────────────────────────────────────────────────────────────

  // 1. ~/Library/Application Support/com.apple.sharedfilelist/ — recent files lists
  const sharedFileList = path.join(home, "Library", "Application Support", "com.apple.sharedfilelist");

  // 2. ~/Library/Preferences/com.apple.recentitems.plist — recent items
  const recentItemsPlist = path.join(home, "Library", "Preferences", "com.apple.recentitems.plist");

  // 3. ~/.recently-used — XDG recent files (if present)
  const xdgRecentFiles = path.join(home, ".recently-used");

  // ── Dry run ───────────────────────────────────────────────────────────────
  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));

    const dryTargets: Array<{ label: string; p: string }> = [];

    if (fs.existsSync(sharedFileList)) {
      const contents = safeReaddir(sharedFileList);
      for (const item of contents) {
        const fullPath = path.join(sharedFileList, item);
        const size = duBytes(fullPath);
        dryTargets.push({ label: "sharedfilelist", p: fullPath });
        freed += size;
        if (options.verbose && !options.json) verboseLine("privacy", fullPath, size, true);
      }
    }

    if (fs.existsSync(recentItemsPlist)) {
      const size = duBytes(recentItemsPlist);
      dryTargets.push({ label: "recentitems.plist", p: recentItemsPlist });
      freed += size;
      if (options.verbose && !options.json) verboseLine("privacy", recentItemsPlist, size, true);
    }

    // Finder plist — use defaults delete (no file removal)
    dryTargets.push({ label: "com.apple.finder RecentFolders", p: "defaults delete" });

    if (fs.existsSync(xdgRecentFiles)) {
      const size = duBytes(xdgRecentFiles);
      dryTargets.push({ label: ".recently-used", p: xdgRecentFiles });
      freed += size;
      if (options.verbose && !options.json) verboseLine("privacy", xdgRecentFiles, size, true);
    }

    if (!options.json && !(options as any)._suppressTable) {
      renderSummaryTable([{ module: "Privacy", paths: dryTargets.length, freed, status: "would_free", warnings: 0 }], true);
    }

    return { ok: true, paths: dryTargets.map((t) => t.p), freed, errors };
  }

  // ── Real deletion ─────────────────────────────────────────────────────────
  if (spinner) spinner.text = "Cleaning privacy targets...";

  // 1. sharedfilelist directory contents
  if (fs.existsSync(sharedFileList)) {
    const contents = safeReaddir(sharedFileList);
    for (const item of contents) {
      const fullPath = path.join(sharedFileList, item);
      const size = duBytes(fullPath);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        cleanedPaths.push(fullPath);
        freed += size;
        if (options.verbose && !options.json) verboseLine("privacy", fullPath, size, false);
      } catch (err) {
        errors.push(`Failed to remove ${fullPath}: ${(err as Error).message}`);
      }
    }
  }

  // 2. com.apple.recentitems.plist
  if (fs.existsSync(recentItemsPlist)) {
    const size = duBytes(recentItemsPlist);
    try {
      fs.rmSync(recentItemsPlist, { force: true });
      cleanedPaths.push(recentItemsPlist);
      freed += size;
      if (options.verbose && !options.json) verboseLine("privacy", recentItemsPlist, size, false);
    } catch (err) {
      errors.push(`Failed to remove ${recentItemsPlist}: ${(err as Error).message}`);
    }
  }

  // 3. Finder recents via `defaults delete` (not rm — safer for plists)
  const finderResult = spawnSync(
    "defaults",
    ["delete", "com.apple.finder", "RecentFolders"],
    { encoding: "utf8", timeout: 5000 }
  );
  if (finderResult.status === 0) {
    cleanedPaths.push("defaults:com.apple.finder:RecentFolders");
    if (options.verbose && !options.json) {
      console.log(chalk.gray(`    [privacy] cleared com.apple.finder RecentFolders`));
    }
  } else if (finderResult.stderr && !finderResult.stderr.includes("does not exist")) {
    errors.push(`defaults delete com.apple.finder RecentFolders: ${finderResult.stderr.trim()}`);
  }

  // 4. ~/.recently-used
  if (fs.existsSync(xdgRecentFiles)) {
    const size = duBytes(xdgRecentFiles);
    try {
      fs.rmSync(xdgRecentFiles, { force: true });
      cleanedPaths.push(xdgRecentFiles);
      freed += size;
      if (options.verbose && !options.json) verboseLine("privacy", xdgRecentFiles, size, false);
    } catch (err) {
      errors.push(`Failed to remove ${xdgRecentFiles}: ${(err as Error).message}`);
    }
  }

  if (spinner) spinner.succeed(chalk.green("Privacy targets cleaned"));

  if (!options.json && !(options as any)._suppressTable) {
    renderSummaryTable([{ module: "Privacy", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length }]);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  const result: CleanResult = { ok: true, paths: cleanedPaths, freed, errors };

  // #44: Audit log
  writeAuditLog({
    command: "clean privacy",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose },
    paths_deleted: cleanedPaths,
    bytes_freed: freed,
    errors,
  });

  return result;
}

function safeReaddir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}
