import chalk from "chalk";
import { CleanOptions, CleanResult } from "../types.js";
import { formatBytes } from "../utils/du.js";
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

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const modules: Array<{ name: string; cleaner: typeof system }> = [
    { name: "system", cleaner: system },
    { name: "brew", cleaner: brew },
    { name: "node", cleaner: node },
    { name: "browser", cleaner: browser },
    { name: "docker", cleaner: docker },
    { name: "xcode", cleaner: xcode },
  ];

  const results: ModuleResult[] = [];
  let totalFreed = 0;
  const allPaths: string[] = [];
  const allErrors: string[] = [];

  for (const { name, cleaner } of modules) {
    if (!options.json) {
      console.log(chalk.bold.blue(`\n━━━ ${name.toUpperCase()} ━━━`));
    }
    const result = await cleaner.clean(options);
    results.push({ name, result });
    totalFreed += result.freed;
    allPaths.push(...result.paths);
    allErrors.push(...result.errors);
  }

  // Print summary table
  if (!options.json) {
    console.log(chalk.bold("\n┌─────────────────────────────────────────┐"));
    console.log(chalk.bold("│           SPACE RECOVERY SUMMARY         │"));
    console.log(chalk.bold("├────────────────┬────────────────────────┤"));
    console.log(chalk.bold("│ Module         │ Freed                  │"));
    console.log(chalk.bold("├────────────────┼────────────────────────┤"));

    for (const { name, result } of results) {
      const freed = formatBytes(result.freed);
      const nameCol = name.padEnd(14);
      const freedCol = freed.padEnd(22);
      const statusIcon = result.ok ? chalk.green("✓") : chalk.red("✗");
      console.log(`│ ${statusIcon} ${nameCol} │ ${chalk.green(freedCol)} │`);
    }

    console.log(chalk.bold("├────────────────┼────────────────────────┤"));
    const totalCol = "TOTAL".padEnd(14);
    const totalFreedStr = formatBytes(totalFreed).padEnd(22);
    console.log(`│ ${chalk.bold(totalCol)} │ ${chalk.bold.green(totalFreedStr)} │`);
    console.log(chalk.bold("└────────────────┴────────────────────────┘"));
  }

  return {
    ok: results.every((r) => r.result.ok),
    paths: allPaths,
    freed: totalFreed,
    errors: allErrors,
  };
}
