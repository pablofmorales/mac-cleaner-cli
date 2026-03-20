import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";

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

/**
 * Walk up to depth 3 from home directory, finding node_modules folders
 * where the parent directory has NO package.json (orphaned).
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
        // Check if parent has package.json
        const parentPackageJson = path.join(dir, "package.json");
        if (!fs.existsSync(parentPackageJson)) {
          orphans.push(fullPath);
        }
        // Don't recurse into node_modules
        continue;
      }

      // Skip hidden dirs (except some known project folders)
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
  const which = spawnSync("which", [tool], { encoding: "utf8" });
  if (which.status !== 0 || !which.stdout.trim()) {
    errors.push(`${tool} not found — skipping`);
    return false;
  }

  const result = spawnSync(tool, args, { encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) {
    errors.push(`${tool} ${args.join(" ")} failed: ${result.stderr}`);
    return false;
  }
  return true;
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : ora("Scanning Node.js caches...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // Collect paths to clean
  const allCachePaths = [
    ...NPM_CACHE_PATHS,
    ...YARN_CACHE_PATHS,
    ...PNPM_CACHE_PATHS,
  ].filter((p) => fs.existsSync(p));

  // Find orphan node_modules
  if (spinner) spinner.text = "Scanning for orphan node_modules (depth 3)...";
  const orphans = findOrphanNodeModules(os.homedir(), 3);

  const allTargets = [...allCachePaths, ...orphans];

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));
    for (const p of allTargets) {
      const size = duBytes(p);
      if (!options.json) {
        const label = orphans.includes(p) ? "[orphan node_modules]" : "[cache]";
        console.log(chalk.gray(`  [dry-run] ${label} ${p} (${formatBytes(size)})`));
      }
      cleanedPaths.push(p);
      freed += size;
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

  // Add cache paths that exist
  for (const p of allCachePaths) {
    if (!cleanedPaths.includes(p)) cleanedPaths.push(p);
  }

  // Remove orphan node_modules
  if (spinner) spinner.text = `Removing ${orphans.length} orphan node_modules...`;
  for (const orphan of orphans) {
    const size = duBytes(orphan);
    try {
      fs.rmSync(orphan, { recursive: true, force: true });
      cleanedPaths.push(orphan);
      freed += size;
      if (!options.json) {
        console.log(chalk.gray(`  removed orphan: ${orphan} (${formatBytes(size)})`));
      }
    } catch (err) {
      errors.push(`Failed to remove ${orphan}: ${(err as Error).message}`);
    }
  }

  // Measure after for caches
  const sizeAfter = allCachePaths.reduce((sum, p) => sum + duBytes(p), 0);
  freed += Math.max(0, sizeBefore - sizeAfter);

  if (spinner) spinner.succeed(chalk.green(`Node cleaned — freed ${formatBytes(freed)}`));

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors };
}
