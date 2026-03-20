import chalk from "chalk";
import { formatBytes } from "./du.js";

export interface SummaryRow {
  module: string;
  paths: number;
  freed: number;
  status: "freed" | "would_free" | "skipped" | "error";
  warnings: number;
}

/**
 * Renders a compact summary table for one or more cleaner results.
 * Used by all modules in quiet mode (default) and by `clean all`.
 */
export function renderSummaryTable(rows: SummaryRow[], dryRun = false): void {
  const COL_MODULE = 14;
  const COL_PATHS = 8;
  const COL_FREED = 12;
  const COL_STATUS = 12;

  const header =
    chalk.bold("Module".padEnd(COL_MODULE)) +
    chalk.bold("Paths".padStart(COL_PATHS)) +
    chalk.bold("Freed".padStart(COL_FREED)) +
    chalk.bold("Status".padStart(COL_STATUS));

  const divider = "─".repeat(COL_MODULE + COL_PATHS + COL_FREED + COL_STATUS);

  console.log();
  console.log(header);
  console.log(chalk.gray(divider));

  let totalPaths = 0;
  let totalFreed = 0;

  for (const row of rows) {
    totalPaths += row.paths;
    totalFreed += row.freed;

    const statusIcon =
      row.status === "freed" ? chalk.green("✅ freed")
      : row.status === "would_free" ? chalk.yellow("✅ would free")
      : row.status === "skipped" ? chalk.gray("⏭  skipped")
      : chalk.red("⚠️  error");

    const freedStr = row.freed > 0 ? formatBytes(row.freed) : chalk.gray("—");
    const pathsStr = row.paths > 0 ? String(row.paths) : chalk.gray("0");

    console.log(
      row.module.padEnd(COL_MODULE) +
      pathsStr.padStart(COL_PATHS) +
      freedStr.padStart(COL_FREED) +
      statusStr(statusIcon, COL_STATUS)
    );
  }

  if (rows.length > 1) {
    console.log(chalk.gray(divider));
    const totalFreedStr = totalFreed > 0 ? formatBytes(totalFreed) : chalk.gray("—");
    console.log(
      chalk.bold("Total".padEnd(COL_MODULE)) +
      chalk.bold(String(totalPaths).padStart(COL_PATHS)) +
      chalk.bold(totalFreedStr.padStart(COL_FREED)) +
      " ".padStart(COL_STATUS)
    );
  }

  console.log();

  if (!dryRun) {
    console.log(chalk.gray("Run with --verbose to see details of each path."));
  }
}

function statusStr(icon: string, width: number): string {
  // chalk adds invisible ANSI chars — pad the visible content only
  const visible = icon.replace(/\x1b\[[0-9;]*m/g, "");
  const padding = Math.max(0, width - visible.length);
  return " ".repeat(padding) + icon;
}

/**
 * Prints a single verbose path line (only shown when --verbose is active).
 */
export function verboseLine(label: string, targetPath: string, size: number, dryRun: boolean): void {
  const prefix = dryRun ? chalk.yellow("[dry-run]") : chalk.gray("[removed]");
  const sizeStr = size > 0 ? chalk.gray(`(${formatBytes(size)})`) : "";
  console.log(`  ${prefix} ${chalk.gray(label)} ${targetPath} ${sizeStr}`);
}
