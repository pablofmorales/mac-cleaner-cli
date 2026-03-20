import chalk from "chalk";
import { CleanOptions, CleanResult } from "../types.js";
import { renderSummaryTable, SummaryRow } from "../utils/format.js";
import * as system from "./system.js";
import * as brew from "./brew.js";
import * as node from "./node.js";
import * as browser from "./browser.js";
import * as docker from "./docker.js";
import * as xcode from "./xcode.js";

interface ModuleResult {
  name: string;
  result: CleanResult;
}

// Suppress the individual module summary tables when running `clean all`
// by passing a special flag — we render one unified table at the end
type AllCleanOptions = CleanOptions & { _suppressTable?: boolean };

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const subOptions: AllCleanOptions = { ...options, _suppressTable: true };

  const modules: Array<{ label: string; cleaner: typeof system }> = [
    { label: "System",  cleaner: system },
    { label: "Brew",    cleaner: brew },
    { label: "Node",    cleaner: node },
    { label: "Browser", cleaner: browser },
    { label: "Docker",  cleaner: docker },
    { label: "Xcode",   cleaner: xcode },
  ];

  const results: ModuleResult[] = [];
  let totalFreed = 0;
  const allPaths: string[] = [];
  const allErrors: string[] = [];

  for (const { label, cleaner } of modules) {
    if (!options.json) {
      process.stdout.write(chalk.gray(`  Running ${label.toLowerCase()} cleaner...`));
    }
    const result = await cleaner.clean(subOptions);
    results.push({ name: label, result });
    totalFreed += result.freed;
    allPaths.push(...result.paths);
    allErrors.push(...result.errors);
    if (!options.json) {
      process.stdout.write(chalk.green(" ✔\n"));
    }
  }

  // Unified summary table for all modules
  if (!options.json) {
    const rows: SummaryRow[] = results.map(({ name, result }) => ({
      module: name,
      paths: result.paths.length,
      freed: result.freed,
      status: result.ok
        ? options.dryRun ? "would_free" : "freed"
        : "error",
      warnings: result.errors.length,
    }));
    renderSummaryTable(rows, options.dryRun);
  }

  return {
    ok: results.every((r) => r.result.ok),
    paths: allPaths,
    freed: totalFreed,
    errors: allErrors,
  };
}
