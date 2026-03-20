import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { CleanOptions, CleanResult } from "../types.js";
import { formatBytes } from "../utils/du.js";

function findBrewPath(): string | null {
  const candidates = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
  for (const p of candidates) {
    const result = spawnSync("test", ["-x", p], { shell: false });
    if (result.status === 0) return p;
  }
  // Try which
  const which = spawnSync("which", ["brew"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  return null;
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : ora("Looking for Homebrew...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  const brewPath = findBrewPath();
  if (!brewPath) {
    if (spinner) spinner.warn(chalk.yellow("Homebrew not found — skipping brew clean"));
    errors.push("Homebrew not installed or not in PATH");
    return { ok: true, paths: [], freed: 0, errors };
  }

  if (spinner) spinner.text = "Getting Homebrew cache size...";

  // Get cache path
  const cacheResult = spawnSync(brewPath, ["--cache"], { encoding: "utf8" });
  const cachePath = cacheResult.stdout.trim();

  // Get size before cleanup
  let sizeBefore = 0;
  if (cachePath) {
    const duResult = spawnSync("du", ["-sk", cachePath], { encoding: "utf8" });
    if (duResult.stdout) {
      const kb = parseInt(duResult.stdout.split("\t")[0], 10);
      if (!isNaN(kb)) sizeBefore = kb * 1024;
    }
  }

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — would run: brew cleanup --prune=all && brew autoremove"));
    if (cachePath) {
      cleanedPaths.push(cachePath);
      freed = sizeBefore;
      if (!options.json) {
        console.log(chalk.gray(`  [dry-run] brew cache: ${cachePath} (${formatBytes(sizeBefore)})`));
      }
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  if (spinner) spinner.text = "Running brew cleanup...";

  const cleanup = spawnSync(brewPath, ["cleanup", "--prune=all", "-s"], {
    encoding: "utf8",
    timeout: 120000,
  });

  if (cleanup.status !== 0) {
    errors.push(`brew cleanup failed: ${cleanup.stderr}`);
  } else {
    if (cachePath) cleanedPaths.push(cachePath);
  }

  if (spinner) spinner.text = "Running brew autoremove...";

  const autoremove = spawnSync(brewPath, ["autoremove"], {
    encoding: "utf8",
    timeout: 120000,
  });

  if (autoremove.status !== 0) {
    errors.push(`brew autoremove failed: ${autoremove.stderr}`);
  }

  // Get size after
  let sizeAfter = 0;
  if (cachePath) {
    const duResult = spawnSync("du", ["-sk", cachePath], { encoding: "utf8" });
    if (duResult.stdout) {
      const kb = parseInt(duResult.stdout.split("\t")[0], 10);
      if (!isNaN(kb)) sizeAfter = kb * 1024;
    }
  }

  freed = Math.max(0, sizeBefore - sizeAfter);

  if (spinner) spinner.succeed(chalk.green(`Brew cleaned — freed ${formatBytes(freed)}`));

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors };
}
