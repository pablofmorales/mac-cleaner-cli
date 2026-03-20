import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";
import { renderSummaryTable, verboseLine } from "../utils/format.js";
import { isSafeToDelete } from "../utils/safeDelete.js";

const NPM_CACHE_PATHS = [
  path.join(os.homedir(), ".npm"),
  path.join(os.homedir(), ".npm/_cacache"),
];

const YARN_CACHE_PATHS = [
  path.join(os.homedir(), "Library", "Caches", "Yarn"),
  path.join(os.homedir(), ".yarn", "cache"),
];

const PNPM_CACHE_PATHS = [
  path.join(os.homedir(), "Library", "Caches", "pnpm"),
  path.join(os.homedir(), ".pnpm-store"),
  path.join(os.homedir(), ".local", "share", "pnpm", "store"),
];

const ANCESTOR_SEARCH_DEPTH = 3;

/**
 * Walk up to `ancestorDepth` levels from a directory to find a package.json.
 * This catches monorepo setups where package.json is 1-3 levels above node_modules.
 */
function hasAncestorPackageJson(dir: string, levelsUp = ANCESTOR_SEARCH_DEPTH): boolean {
  let current = dir;
  for (let i = 0; i < levelsUp; i++) {
    if (fs.existsSync(path.join(current, "package.json"))) return true;
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return false;
}

/**
 * Walk up to depth 3 from home directory, finding node_modules folders
 * that have no package.json anywhere in their ancestor chain (up to 3 levels).
 *
 * This avoids false positives in monorepos where node_modules exists in a
 * sub-package but the root package.json is a few levels up.
 */
function findOrphanNodeModules(baseDir: string, maxDepth = 3): string[] {
  const orphans: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.name === "node_modules") {
        // Check the parent directory AND up to 3 ancestors for package.json
        if (!hasAncestorPackageJson(dir, ANCESTOR_SEARCH_DEPTH)) {
          orphans.push(fullPath);
        }
        // Never recurse into node_modules
        continue;
      }

      // Skip hidden dirs
      if (entry.name.startsWith(".")) continue;

      walk(fullPath, depth + 1);
    }
  }

  walk(baseDir, 0);
  return orphans;
}

function cleanWithTool(
  tool: string,
  args: string[],
  errors: string[]
): boolean {
  const which = spawnSync("which", [tool], { encoding: "utf8", timeout: 5000 });
  if (which.status !== 0 || !which.stdout.trim()) {
    errors.push(`${tool} not found — skipping`);
    return false;
  }

  const result = spawnSync(tool, args, { encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) {
    const stderr = result.stderr || "";
    const isPermissionError = /EACCES|permission denied/i.test(stderr);
    if (tool === "npm" && isPermissionError) {
      // Issue #63: show actionable hint for npm permission errors
      errors.push(
        `npm cache is owned by root — fix with:\n` +
        `  sudo chown -R $(id -u):$(id -g) ~/.npm\n` +
        `  Then re-run: mac-cleaner node`
      );
    } else {
      errors.push(`${tool} ${args.join(" ")} failed: ${stderr}`);
    }
    return false;
  }
  return true;
}

export interface NodeCleanOptions extends CleanOptions {
  /** If true, orphan node_modules directories will be deleted. Default: false (warn only). */
  includeOrphans?: boolean;
}

export async function clean(options: NodeCleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : createSpinner("Scanning Node.js caches...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // Collect cache paths to clean
  const allCachePaths = [
    ...NPM_CACHE_PATHS,
    ...YARN_CACHE_PATHS,
    ...PNPM_CACHE_PATHS,
  ].filter((p) => fs.existsSync(p));

  // Find orphan node_modules (always detect, but only delete if --include-orphans)
  if (spinner) spinner.text = "Scanning for orphan node_modules (depth 3, checking 3 ancestors)...";
  const orphans = findOrphanNodeModules(os.homedir(), 3);

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));
    for (const p of allCachePaths) {
      const size = duBytes(p);
      if (options.verbose && !options.json) {
        verboseLine("cache", p, size, true);
      }
      cleanedPaths.push(p);
      freed += size;
    }
    for (const p of orphans) {
      const size = duBytes(p);
      if (options.verbose && !options.json) {
        const action = options.includeOrphans ? "[dry-run, would delete]" : "[dry-run, use --include-orphans to delete]";
        console.log(chalk.gray(`  ${action} [orphan] ${p} (${formatBytes(size)})`));
      }
      if (options.includeOrphans) {
        cleanedPaths.push(p);
        freed += size;
      }
    }
    if (!options.json && !(options as any)._suppressTable) {
      renderSummaryTable([{ module: "Node", paths: cleanedPaths.length, freed, status: "would_free", warnings: errors.length }], true);
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  // Measure before
  const sizeBefore = allCachePaths.reduce((sum, p) => sum + duBytes(p), 0);

  if (spinner) spinner.text = "Cleaning npm cache...";
  cleanWithTool("npm", ["cache", "clean", "--force"], errors);

  if (spinner) spinner.text = "Cleaning yarn cache...";
  cleanWithTool("yarn", ["cache", "clean"], errors);

  if (spinner) spinner.text = "Cleaning pnpm cache...";
  cleanWithTool("pnpm", ["store", "prune"], errors);

  for (const p of allCachePaths) {
    if (!cleanedPaths.includes(p)) cleanedPaths.push(p);
  }

  // Orphan node_modules — warn always, delete only if --include-orphans
  if (orphans.length > 0) {
    if (options.includeOrphans) {
      if (spinner) spinner.text = `Removing ${orphans.length} orphan node_modules...`;
      for (const orphan of orphans) {
        // Security (#43): resolve symlinks before deletion to prevent traversal attacks
        if (!isSafeToDelete(orphan, os.homedir())) {
          errors.push(`Skipped (symlink escape detected): ${orphan}`);
          continue;
        }
        const size = duBytes(orphan);
        try {
          fs.rmSync(orphan, { recursive: true, force: true });
          cleanedPaths.push(orphan);
          freed += size;
          if (options.verbose && !options.json && !(options as any)._suppressTable) {
            verboseLine("orphan", orphan, size, false);
          }
        } catch (err) {
          errors.push(`Failed to remove ${orphan}: ${(err as Error).message}`);
        }
      }
    } else {
      // Warn but don't delete — always visible (not gated by verbose)
      if (!options.json && !(options as any)._suppressTable) {
        console.log(chalk.yellow(`\n  ⚠️  Found ${orphans.length} orphan node_modules (not deleted — run with --include-orphans to remove):`));
        for (const orphan of orphans) {
          const size = duBytes(orphan);
          console.log(chalk.gray(`    ${orphan} (${formatBytes(size)})`));
        }
      }
    }
  }

  // Measure after for caches
  const sizeAfter = allCachePaths.reduce((sum, p) => sum + duBytes(p), 0);
  freed += Math.max(0, sizeBefore - sizeAfter);

  if (spinner) spinner.succeed(chalk.green("Node cleaned"));

  if (!options.json && !(options as any)._suppressTable) {
    renderSummaryTable([{ module: "Node", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length }]);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors };
}
