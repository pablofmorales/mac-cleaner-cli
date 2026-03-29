import chalk from "chalk";
import { CleanOptions, CleanResult } from "../types.js";
import { renderSummaryTable, SummaryRow } from "../utils/format.js";
import * as system from "./system.js";
import * as brew from "./brew.js";
import * as node from "./node.js";
import * as browser from "./browser.js";
import * as docker from "./docker.js";
import * as xcode from "./xcode.js";
import * as keychain from "./keychain.js";
import * as privacy from "./privacy.js";
import * as mobile from "./mobile.js";
import * as startup from "./startup.js";
import * as cloud from "./cloud.js";
import * as mail from "./mail.js";
import * as apps from "./apps.js";

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
    { label: "system",   cleaner: system },
    { label: "brew",     cleaner: brew },
    { label: "node",     cleaner: node },
    { label: "browser",  cleaner: browser },
    { label: "docker",   cleaner: docker },
    { label: "xcode",    cleaner: xcode },
    { label: "keychain", cleaner: keychain as unknown as typeof system },
    { label: "privacy",  cleaner: privacy as unknown as typeof system },
    { label: "mobile",   cleaner: mobile },
    { label: "startup",  cleaner: startup as unknown as typeof system },
    { label: "cloud",    cleaner: cloud },
    { label: "mail",     cleaner: mail },
    { label: "apps",     cleaner: apps },
  ];

  const results: ModuleResult[] = [];
  let totalFreed = 0;
  const allPaths: string[] = [];
  const allErrors: string[] = [];

  for (const { label, cleaner } of modules) {
    const result = await cleaner.clean(subOptions);
    results.push({ name: label, result });
    totalFreed += result.freed;
    allPaths.push(...result.paths);
    allErrors.push(...result.errors);
  }

  // #26: JSON per-module breakdown
  if (options.json) {
    const modules_breakdown: Record<string, { freed: number; paths: number; errors: string[] }> = {};
    for (const { name, result } of results) {
      modules_breakdown[name] = {
        freed: result.freed,
        paths: result.paths.length,
        errors: result.errors,
      };
    }
    console.log(
      JSON.stringify({
        ok: results.every((r) => r.result.ok),
        data: {
          modules: modules_breakdown,
          total: {
            freed: totalFreed,
            paths: allPaths.length,
          },
        },
        error: allErrors.length ? allErrors : null,
      })
    );
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
