import { spawnSync } from "child_process";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { renderSummaryTable, SummaryRow } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

interface MaintenanceTask {
  label: string;
  description: string;
  command: string;
  args: string[];
  requiresSudo: boolean;
}

const LSREGISTER_PATH =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const tasks: MaintenanceTask[] = [
  {
    label: "Flush DNS cache",
    description: "Clear the local DNS resolver cache",
    command: "dscacheutil",
    args: ["-flushcache"],
    requiresSudo: false,
  },
  {
    label: "Restart mDNSResponder",
    description: "Send HUP signal to mDNSResponder to complete DNS flush",
    command: "sudo",
    args: ["-n", "killall", "-HUP", "mDNSResponder"],
    requiresSudo: true,
  },
  {
    label: "Rebuild Spotlight index",
    description: "Erase and rebuild the Spotlight metadata index",
    command: "sudo",
    args: ["-n", "mdutil", "-E", "/"],
    requiresSudo: true,
  },
  {
    label: "Repair disk permissions",
    description: "Reset user permissions on the boot volume",
    command: "diskutil",
    args: ["resetUserPermissions", "/", String(process.getuid?.() ?? 501)],
    requiresSudo: false,
  },
  {
    label: "Rebuild Launch Services database",
    description: "Clear and rebuild the Launch Services registration database",
    command: LSREGISTER_PATH,
    args: ["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"],
    requiresSudo: false,
  },
  {
    label: "Purge inactive memory",
    description: "Force macOS to purge inactive memory from RAM",
    command: "sudo",
    args: ["-n", "purge"],
    requiresSudo: true,
  },
  {
    label: "Clear font caches",
    description: "Remove cached font data so the system rebuilds it on next use",
    command: "sudo",
    args: ["-n", "atsutil", "databases", "-remove"],
    requiresSudo: true,
  },
];

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const suppressTable = (options as any)._suppressTable === true;
  const spinner = options.json ? null : createSpinner("Running maintenance tasks...").start();
  const errors: string[] = [];
  const completedTasks: string[] = [];
  const skipSudo = options.noSudo || options.yes;

  // ── Dry run ──────────────────────────────────────────────────────────────
  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run -- nothing executed"));

    for (const task of tasks) {
      if (task.requiresSudo && skipSudo) {
        if (options.verbose && !options.json) {
          console.log(chalk.gray(`  [dry-run] skip (no-sudo): ${task.label} -- ${task.description}`));
        }
        continue;
      }
      completedTasks.push(task.label);
      if (options.verbose && !options.json) {
        console.log(chalk.gray(`  [dry-run] would run: ${task.label} -- ${task.description}`));
      }
    }

    if (!options.json && !suppressTable) {
      const skipped = tasks.filter((t) => t.requiresSudo && skipSudo).length;
      const rows: SummaryRow[] = [
        {
          module: "Maintain",
          paths: completedTasks.length,
          freed: 0,
          status: "would_free",
          warnings: skipped,
        },
      ];
      renderSummaryTable(rows, true);
    }

    return { ok: true, paths: completedTasks, freed: 0, errors };
  }

  // ── Real run ─────────────────────────────────────────────────────────────
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const task of tasks) {
    if (task.requiresSudo && skipSudo) {
      skipped++;
      if (options.verbose && !options.json) {
        console.log(chalk.gray(`  [skipped] ${task.label} (requires sudo)`));
      }
      continue;
    }

    if (spinner) spinner.text = task.label;

    const result = spawnSync(task.command, task.args, {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status === 0) {
      succeeded++;
      completedTasks.push(task.label);
      if (options.verbose && !options.json) {
        console.log(chalk.gray(`  [done] ${task.label}`));
      }
    } else {
      failed++;
      const stderr = (result.stderr ?? "").trim();
      // Filter out sudo password prompts from error messages
      const safeStderr = stderr.replace(/password[:\s]*/gi, "[password prompt]").trim();
      const msg = safeStderr || `exit code ${result.status}`;
      errors.push(`${task.label}: ${msg}`);
      if (options.verbose && !options.json) {
        console.log(chalk.yellow(`  [fail] ${task.label}: ${msg}`));
      }
    }
  }

  if (spinner) {
    if (failed === 0) {
      spinner.succeed(chalk.green(`Maintenance complete (${succeeded} tasks)`));
    } else {
      spinner.warn(chalk.yellow(`Maintenance done: ${succeeded} ok, ${failed} failed, ${skipped} skipped`));
    }
  }

  if (!options.json && !suppressTable) {
    const rows: SummaryRow[] = [
      {
        module: "Maintain",
        paths: completedTasks.length,
        freed: 0,
        status: failed > 0 ? "error" : "freed",
        warnings: failed + skipped,
      },
    ];
    renderSummaryTable(rows);
  }

  if (errors.length > 0 && !options.json && options.verbose) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  \u26a0 ${e}`));
    }
  }

  const result: CleanResult = { ok: true, paths: completedTasks, freed: 0, errors };

  // Audit log
  writeAuditLog({
    command: "clean maintain",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose, noSudo: options.noSudo },
    paths_deleted: completedTasks,
    bytes_freed: 0,
    errors,
  });

  return result;
}
