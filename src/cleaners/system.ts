import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";
import { renderSummaryTable, verboseLine } from "../utils/format.js";

function getSubdirectories(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  try {
    return fs.readdirSync(dirPath)
      .map((name) => path.join(dirPath, name))
      .filter((p) => {
        try {
          const stat = fs.statSync(p);
          return stat.isDirectory() || stat.isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function removePathSafe(targetPath: string, errors: string[]): number {
  const size = duBytes(targetPath);
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return size;
  } catch (err) {
    errors.push(`Failed to remove ${targetPath}: ${(err as Error).message}`);
    return 0;
  }
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : ora("Scanning system caches...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // Collect all candidate paths
  const candidates: string[] = [];

  const userCaches = path.join(os.homedir(), "Library", "Caches");
  candidates.push(...getSubdirectories(userCaches));
  candidates.push(...getSubdirectories("/tmp"));
  candidates.push(...getSubdirectories("/private/tmp"));

  // System logs — only .log files (permission-safe)
  if (fs.existsSync("/var/log")) {
    try {
      const logFiles = fs.readdirSync("/var/log")
        .map((f) => path.join("/var/log", f))
        .filter((f) => f.endsWith(".log") || f.endsWith(".log.gz"));
      candidates.push(...logFiles);
    } catch {
      // permission denied — skip silently
    }
  }

  const userLogs = path.join(os.homedir(), "Library", "Logs");
  candidates.push(...getSubdirectories(userLogs));

  if (spinner) spinner.text = `Found ${candidates.length} items to scan`;

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("✔ Dry run — nothing deleted"));
    for (const p of candidates) {
      const size = duBytes(p);
      if (options.verbose && !options.json) {
        verboseLine("system", p, size, true);
      }
      cleanedPaths.push(p);
      freed += size;
    }
  } else {
    if (spinner) spinner.text = "Cleaning system caches...";
    for (const p of candidates) {
      const size = removePathSafe(p, errors);
      if (size > 0 || !fs.existsSync(p)) {
        if (options.verbose && !options.json) {
          verboseLine("system", p, size, false);
        }
        cleanedPaths.push(p);
        freed += size;
      }
    }

    const periodic = spawnSync("periodic", ["daily", "weekly", "monthly"], {
      encoding: "utf8",
      timeout: 30000,
    });
    if (periodic.error) {
      errors.push("periodic scripts not available (non-fatal)");
    }

    if (spinner) spinner.succeed(chalk.green("✔ System cleaned"));
  }

  if (!options.json && !(options as any)._suppressTable) {
    renderSummaryTable([
      {
        module: "System",
        paths: cleanedPaths.length,
        freed,
        status: options.dryRun ? "would_free" : "freed",
        warnings: errors.length,
      },
    ], options.dryRun);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors };
}
