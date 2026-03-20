import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";

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
  const spinner = options.json ? null : ora("Scanning browser caches...").start();
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
      if (!options.json) {
        console.log(chalk.gray(`  [dry-run] [${browser}] ${p} (${formatBytes(size)})`));
      }
      cleanedPaths.push(p);
      freed += size;
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  if (spinner) spinner.text = `Cleaning ${allCandidates.length} browser cache paths...`;

  for (const { browser, path: p } of allCandidates) {
    const size = duBytes(p);
    try {
      fs.rmSync(p, { recursive: true, force: true });
      cleanedPaths.push(p);
      freed += size;
      if (!options.json) {
        console.log(chalk.gray(`  cleaned [${browser}]: ${path.basename(p)} (${formatBytes(size)})`));
      }
    } catch (err) {
      errors.push(`Failed to remove ${p}: ${(err as Error).message}`);
    }
  }

  if (spinner) spinner.succeed(chalk.green(`Browser caches cleaned — freed ${formatBytes(freed)}`));

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors };
}
