import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";
import { renderSummaryTable, verboseLine } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

const home = os.homedir();

const BROWSER_CACHE_PATHS: Record<string, string[]> = {
  Chrome: [
    path.join(home, "Library", "Caches", "Google", "Chrome"),
    path.join(home, "Library", "Application Support", "Google", "Chrome", "Default", "Cache"),
    path.join(home, "Library", "Application Support", "Google", "Chrome", "Default", "Code Cache"),
  ],
  Firefox: [
    path.join(home, "Library", "Caches", "Firefox"),
    path.join(home, "Library", "Caches", "Mozilla"),
    path.join(home, "Library", "Application Support", "Firefox", "Profiles"),
  ],
  Safari: [
    path.join(home, "Library", "Caches", "com.apple.Safari"),
    path.join(home, "Library", "Safari", "Favicon Cache"),
  ],
  Arc: [
    path.join(home, "Library", "Caches", "Arc"),
    path.join(home, "Library", "Application Support", "Arc", "User Data", "Default", "Cache"),
    path.join(home, "Library", "Application Support", "Arc", "User Data", "Default", "Code Cache"),
  ],
  Brave: [
    path.join(home, "Library", "Caches", "BraveSoftware"),
    path.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser", "Default", "Cache"),
    path.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser", "Default", "Code Cache"),
  ],
};

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : createSpinner("Scanning browser caches...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  const allCandidates: Array<{ browser: string; path: string }> = [];

  for (const [browser, paths] of Object.entries(BROWSER_CACHE_PATHS)) {
    for (const p of paths) {
      if (fs.existsSync(p)) {
        allCandidates.push({ browser, path: p });
      }
    }
  }

  if (allCandidates.length === 0) {
    if (spinner) spinner.info("No browser caches found");
    return { ok: true, paths: [], freed: 0, errors };
  }

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));
    for (const { browser, path: p } of allCandidates) {
      const size = duBytes(p);
      if (options.verbose && !options.json) {
        verboseLine(browser, p, size, true);
      }
      cleanedPaths.push(p);
      freed += size;
    }
    if (!options.json && !(options as any)._suppressTable) {
      renderSummaryTable([{ module: "Browser", paths: cleanedPaths.length, freed, status: "would_free", warnings: errors.length }], true);
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  if (spinner) spinner.text = `Cleaning ${allCandidates.length} browser cache paths...`;

  for (const { browser, path: p } of allCandidates) {
    const size = duBytes(p);
    try {
      // #41: Secure delete — overwrite file with zeros before removal (macOS, files only)
      if (options.secureDelete && process.platform === "darwin") {
        let stat: fs.Stats | null = null;
        try { stat = fs.statSync(p); } catch { /* ignore */ }
        if (stat?.isFile()) {
          if (options.verbose && !options.json) {
            console.log(chalk.gray(`    [secure-delete] overwriting ${p}`));
          }
          // Security fix (Gerard HIGH): overwrite full file size using Node.js Buffer
          if (stat && stat.size > 0) {
            try { fs.writeFileSync(p, Buffer.alloc(stat.size)); } catch { /* best-effort */ }
          }
        }
      }
      fs.rmSync(p, { recursive: true, force: true });
      cleanedPaths.push(p);
      freed += size;
      if (options.verbose && !options.json) {
        verboseLine(browser, p, size, false);
      }
    } catch (err) {
      errors.push(`Failed to remove ${p}: ${(err as Error).message}`);
    }
  }

  if (spinner) spinner.succeed(chalk.green("Browser caches cleaned"));

  if (!options.json && !(options as any)._suppressTable) {
    renderSummaryTable([{ module: "Browser", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length }]);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  // #44: Audit log
  writeAuditLog({
    command: "clean browser",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose, secureDelete: options.secureDelete },
    paths_deleted: cleanedPaths,
    bytes_freed: freed,
    errors,
  });

  return { ok: true, paths: cleanedPaths, freed, errors };
}
