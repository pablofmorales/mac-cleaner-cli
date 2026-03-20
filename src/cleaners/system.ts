import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";
import { renderSummaryTable, SummaryRow, verboseLine } from "../utils/format.js";
import { isPrivilegedPath } from "../utils/privilegedPaths.js";
import { promptSudoPassword, sudoRmRf, verifySudoPassword } from "../utils/sudo.js";
import { isSafeToDelete } from "../utils/safeDelete.js";

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

function removePathSafe(targetPath: string, errors: string[], allowedBase: string): number {
  // Security (#43): check that resolved path doesn't escape the allowed base via symlinks
  if (!isSafeToDelete(targetPath, allowedBase)) {
    errors.push(`Skipped (symlink escape detected): ${targetPath}`);
    return 0;
  }
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
  const suppressTable = (options as any)._suppressTable === true;
  const spinner = options.json ? null : ora("Scanning system caches...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;
  let privilegedSkipped = 0;
  let privilegedFreed = 0;

  // Collect all candidate paths
  const allCandidates: string[] = [];

  const userCaches = path.join(os.homedir(), "Library", "Caches");
  allCandidates.push(...getSubdirectories(userCaches));
  allCandidates.push(...getSubdirectories("/tmp"));
  allCandidates.push(...getSubdirectories("/private/tmp"));

  if (fs.existsSync("/var/log")) {
    try {
      const logFiles = fs.readdirSync("/var/log")
        .map((f) => path.join("/var/log", f))
        .filter((f) => f.endsWith(".log") || f.endsWith(".log.gz"));
      allCandidates.push(...logFiles);
    } catch {
      // permission denied — these become privileged paths
    }
  }

  const userLogs = path.join(os.homedir(), "Library", "Logs");
  allCandidates.push(...getSubdirectories(userLogs));

  // Split into normal and privileged buckets
  const normalPaths = allCandidates.filter((p) => !isPrivilegedPath(p));
  const privilegedPaths = allCandidates.filter((p) => isPrivilegedPath(p));

  if (spinner) spinner.text = `Found ${allCandidates.length} items (${privilegedPaths.length} require sudo)`;

  // ── Dry run ──────────────────────────────────────────────────────────────
  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));

    for (const p of normalPaths) {
      const size = duBytes(p);
      if (options.verbose && !options.json) verboseLine("system", p, size, true);
      cleanedPaths.push(p);
      freed += size;
    }

    const privSize = privilegedPaths.reduce((sum, p) => sum + duBytes(p), 0);
    const noSudo = options.noSudo || options.yes;

    if (!options.json && !suppressTable) {
      const rows: SummaryRow[] = [
        { module: "User caches", paths: cleanedPaths.length, freed, status: "would_free", warnings: 0 },
        {
          module: "Privileged",
          paths: privilegedPaths.length,
          freed: privSize,
          status: noSudo ? "skipped" : "would_free",
          warnings: noSudo ? privilegedPaths.length : 0,
        },
      ];
      renderSummaryTable(rows, true);
    }

    return {
      ok: true,
      paths: [...cleanedPaths, ...(noSudo ? [] : privilegedPaths)],
      freed: freed + (noSudo ? 0 : privSize),
      errors,
      privilegedSkipped: noSudo ? privilegedPaths.length : 0,
    };
  }

  // ── Normal paths ─────────────────────────────────────────────────────────
  if (spinner) spinner.text = "Cleaning system caches...";

  for (const p of normalPaths) {
    const size = removePathSafe(p, errors, os.homedir());
    if (size > 0 || !fs.existsSync(p)) {
      if (options.verbose && !options.json) verboseLine("system", p, size, false);
      cleanedPaths.push(p);
      freed += size;
    }
  }

  // Run periodic scripts (best-effort)
  spawnSync("periodic", ["daily", "weekly", "monthly"], { encoding: "utf8", timeout: 30000 });

  // ── Privileged paths ─────────────────────────────────────────────────────
  const skipSudo = options.noSudo || options.yes || !process.stdin.isTTY;

  if (privilegedPaths.length > 0 && !skipSudo && !options.json) {
    // Prompt once for sudo password — returns Buffer for zeroization
    const passwordBuf = await promptSudoPassword(privilegedPaths);

    if (passwordBuf.length > 0) {
      try {
        // Verify the password first (non-destructive sudo -v)
        const valid = verifySudoPassword(passwordBuf);
        if (!valid) {
          errors.push("Sudo password incorrect — privileged paths skipped");
          privilegedSkipped = privilegedPaths.length;
        } else {
          for (const p of privilegedPaths) {
            const { freed: f, error } = sudoRmRf(p, passwordBuf);
            if (error) {
              errors.push(error);
              privilegedSkipped++;
            } else {
              cleanedPaths.push(p);
              privilegedFreed += f;
              if (options.verbose) verboseLine("sudo", p, f, false);
            }
          }
        }
      } finally {
        // Security (#39): zeroize password Buffer immediately after use
        passwordBuf.fill(0);
      }
    } else {
      // User pressed Enter to skip
      privilegedSkipped = privilegedPaths.length;
    }
  } else {
    privilegedSkipped = privilegedPaths.length;
  }

  freed += privilegedFreed;

  if (spinner) spinner.succeed(chalk.green("System cleaned"));

  if (!options.json && !suppressTable) {
    const rows: SummaryRow[] = [
      { module: "User caches", paths: cleanedPaths.filter((p) => !isPrivilegedPath(p)).length, freed: freed - privilegedFreed, status: "freed", warnings: errors.filter((e) => !e.includes("sudo")).length },
    ];
    if (privilegedPaths.length > 0) {
      rows.push({
        module: "Privileged",
        paths: cleanedPaths.filter((p) => isPrivilegedPath(p)).length,
        freed: privilegedFreed,
        status: privilegedSkipped > 0 ? "skipped" : "freed",
        warnings: privilegedSkipped,
      });
    }
    renderSummaryTable(rows);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors, privilegedSkipped };
}
