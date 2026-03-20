import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { CleanOptions, CleanResult } from "../types.js";
import { formatBytes } from "../utils/du.js";

function findDockerPath(): string | null {
  const which = spawnSync("which", ["docker"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  return null;
}

function dockerDiskUsage(dockerPath: string): number {
  const result = spawnSync(dockerPath, ["system", "df", "--format", "{{.Size}}"], {
    encoding: "utf8",
    timeout: 30000,
  });
  // Parse total reclaimable space from docker system df
  const dfResult = spawnSync(dockerPath, ["system", "df"], {
    encoding: "utf8",
    timeout: 30000,
  });
  if (dfResult.status !== 0) return 0;

  let totalBytes = 0;
  const lines = dfResult.stdout.split("\n");
  for (const line of lines) {
    const reclaimMatch = line.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\s+\((\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\s+reclaimable\)/);
    if (reclaimMatch) {
      const value = parseFloat(reclaimMatch[3]);
      const unit = reclaimMatch[4];
      const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3, TB: 1024**4 };
      totalBytes += value * (multipliers[unit] || 1);
    }
  }
  return totalBytes;
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : ora("Looking for Docker...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  const dockerPath = findDockerPath();
  if (!dockerPath) {
    if (spinner) spinner.warn(chalk.yellow("Docker not found — skipping docker clean"));
    errors.push("Docker not installed or not in PATH");
    return { ok: true, paths: [], freed: 0, errors };
  }

  // Check if Docker daemon is running
  const info = spawnSync(dockerPath, ["info"], { encoding: "utf8", timeout: 10000 });
  if (info.status !== 0) {
    if (spinner) spinner.warn(chalk.yellow("Docker daemon not running — skipping"));
    errors.push("Docker daemon is not running");
    return { ok: true, paths: [], freed: 0, errors };
  }

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — would run: docker system prune -af --volumes"));
    const reclaimable = dockerDiskUsage(dockerPath);
    freed = reclaimable;
    cleanedPaths.push("docker://containers", "docker://images", "docker://volumes", "docker://build-cache");
    if (!options.json) {
      console.log(chalk.gray(`  [dry-run] docker system prune -af --volumes`));
      console.log(chalk.gray(`  [dry-run] estimated reclaimable: ${formatBytes(reclaimable)}`));
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  if (spinner) spinner.text = "Pruning Docker containers, images, volumes, and build cache...";

  // Prune stopped containers
  const containers = spawnSync(dockerPath, ["container", "prune", "-f"], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (containers.status === 0) {
    cleanedPaths.push("docker://containers");
  } else {
    errors.push(`docker container prune failed: ${containers.stderr}`);
  }

  // Remove unused images
  const images = spawnSync(dockerPath, ["image", "prune", "-af"], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (images.status === 0) {
    cleanedPaths.push("docker://images");
    // Parse freed space from output
    const match = images.stdout.match(/Total reclaimed space:\s*([\d.]+)\s*(B|kB|MB|GB)/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
      freed += value * (multipliers[unit] || 1);
    }
  } else {
    errors.push(`docker image prune failed: ${images.stderr}`);
  }

  // Prune volumes
  const volumes = spawnSync(dockerPath, ["volume", "prune", "-f"], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (volumes.status === 0) {
    cleanedPaths.push("docker://volumes");
    const match = volumes.stdout.match(/Total reclaimed space:\s*([\d.]+)\s*(B|kB|MB|GB)/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
      freed += value * (multipliers[unit] || 1);
    }
  } else {
    errors.push(`docker volume prune failed: ${volumes.stderr}`);
  }

  // Prune build cache
  const buildCache = spawnSync(dockerPath, ["builder", "prune", "-af"], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (buildCache.status === 0) {
    cleanedPaths.push("docker://build-cache");
    const match = buildCache.stdout.match(/Total:\s*([\d.]+)\s*(B|kB|MB|GB)/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
      freed += value * (multipliers[unit] || 1);
    }
  } else {
    errors.push(`docker builder prune failed: ${buildCache.stderr}`);
  }

  if (spinner) spinner.succeed(chalk.green(`Docker cleaned — freed ${formatBytes(freed)}`));

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors };
}
