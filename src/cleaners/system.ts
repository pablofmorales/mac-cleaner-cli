import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";

const SYSTEM_PATHS = [
  path.join(os.homedir(), "Library", "Caches"),
  "/tmp",
  "/private/tmp",
  "/var/log",
  path.join(os.homedir(), "Library", "Logs"),
];

function getSubdirectories(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  try {
    return fs.readdirSync(dirPath)
      .map((name) => path.join(dirPath, name))
      .filter((p) => {
        try {
          return fs.statSync(p).isDirectory() || fs.statSync(p).isFile();
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

  // ~/Library/Caches subdirectories
  const userCaches = path.join(os.homedir(), "Library", "Caches");
  candidates.push(...getSubdirectories(userCaches));

  // /tmp contents
  candidates.push(...getSubdirectories("/tmp"));
  candidates.push(...getSubdirectories("/private/tmp"));

  // System logs
  if (fs.existsSync("/var/log")) {
    // Only remove .log files, not directories
    try {
      const logFiles = fs.readdirSync("/var/log")
        .map((f) => path.join("/var/log", f))
        .filter((f) => f.endsWith(".log") || f.endsWith(".log.gz"));
      candidates.push(...logFiles);
    } catch {
      // permission denied, skip silently
    }
  }

  // ~/Library/Logs subdirectories
  const userLogs = path.join(os.homedir(), "Library", "Logs");
  candidates.push(...getSubdirectories(userLogs));

  if (spinner) spinner.text = `Found ${candidates.length} items to clean`;

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));
    for (const p of candidates) {
      const size = duBytes(p);
      if (!options.json) {
        console.log(chalk.gray(`  [dry-run] ${p} (${formatBytes(size)})`));
      }
      cleanedPaths.push(p);
      freed += size;
    }
  } else {
    if (spinner) spinner.text = "Cleaning system caches...";
    for (const p of candidates) {
      const size = removePathSafe(p, errors);
      if (size > 0 || fs.existsSync(p) === false) {
        cleanedPaths.push(p);
        freed += size;
      }
    }

    // Also run periodic scripts if available (macOS)
    const periodic = spawnSync("periodic", ["daily", "weekly", "monthly"], {
      encoding: "utf8",
      timeout: 30000,
    });
    if (periodic.error) {
      errors.push("periodic scripts not available (non-fatal)");
    }

    if (spinner) spinner.succeed(chalk.green(`System cleaned — freed ${formatBytes(freed)}`));
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors };
}
