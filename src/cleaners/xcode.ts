import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import ora from "ora";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";

const home = os.homedir();

const XCODE_PATHS = {
  derivedData: path.join(home, "Library", "Developer", "Xcode", "DerivedData"),
  archives: path.join(home, "Library", "Developer", "Xcode", "Archives"),
  deviceSupport: path.join(home, "Library", "Developer", "Xcode", "iOS DeviceSupport"),
  simulatorDevices: path.join(home, "Library", "Developer", "CoreSimulator", "Devices"),
  simulatorCaches: path.join(home, "Library", "Developer", "CoreSimulator", "Caches"),
  previewSimulators: path.join(home, "Library", "Developer", "XCPGDevices"),
};

function isXcodeInstalled(): boolean {
  const result = spawnSync("xcode-select", ["-p"], { encoding: "utf8" });
  return result.status === 0;
}

function cleanSimulators(errors: string[], dryRun: boolean): number {
  const xcrunPath = spawnSync("which", ["xcrun"], { encoding: "utf8" });
  if (xcrunPath.status !== 0) {
    errors.push("xcrun not found — cannot clean simulators");
    return 0;
  }

  const simPath = XCODE_PATHS.simulatorDevices;
  const sizeBefore = duBytes(simPath);

  if (dryRun) return sizeBefore;

  // Delete unavailable simulators
  const result = spawnSync("xcrun", ["simctl", "delete", "unavailable"], {
    encoding: "utf8",
    timeout: 60000,
  });

  if (result.status !== 0) {
    errors.push(`xcrun simctl delete unavailable failed: ${result.stderr}`);
    return 0;
  }

  const sizeAfter = duBytes(simPath);
  return Math.max(0, sizeBefore - sizeAfter);
}

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : ora("Looking for Xcode...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  if (!isXcodeInstalled()) {
    if (spinner) spinner.warn(chalk.yellow("Xcode not found — skipping xcode clean"));
    errors.push("Xcode not installed");
    return { ok: true, paths: [], freed: 0, errors };
  }

  const targetPaths = [
    XCODE_PATHS.derivedData,
    XCODE_PATHS.simulatorCaches,
    XCODE_PATHS.previewSimulators,
  ];

  // Optionally clean device support (large but sometimes needed)
  // We'll include it but note it in output
  if (fs.existsSync(XCODE_PATHS.deviceSupport)) {
    targetPaths.push(XCODE_PATHS.deviceSupport);
  }

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run — nothing deleted"));
    for (const p of targetPaths) {
      if (fs.existsSync(p)) {
        const size = duBytes(p);
        if (!options.json) {
          console.log(chalk.gray(`  [dry-run] ${p} (${formatBytes(size)})`));
        }
        cleanedPaths.push(p);
        freed += size;
      }
    }
    // Simulators
    const simSize = cleanSimulators(errors, true);
    if (simSize > 0 && !options.json) {
      console.log(chalk.gray(`  [dry-run] unavailable simulators (~${formatBytes(simSize)})`));
    }
    freed += simSize;
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  // Clean DerivedData and caches
  for (const p of targetPaths) {
    if (fs.existsSync(p)) {
      if (spinner) spinner.text = `Cleaning ${path.basename(p)}...`;
      const size = duBytes(p);
      try {
        fs.rmSync(p, { recursive: true, force: true });
        cleanedPaths.push(p);
        freed += size;
        if (!options.json) {
          console.log(chalk.gray(`  removed: ${p} (${formatBytes(size)})`));
        }
      } catch (err) {
        errors.push(`Failed to remove ${p}: ${(err as Error).message}`);
      }
    }
  }

  // Clean unavailable simulators
  if (spinner) spinner.text = "Removing unavailable simulators...";
  const simFreed = cleanSimulators(errors, false);
  freed += simFreed;
  if (simFreed > 0) {
    cleanedPaths.push("xcode://simulators/unavailable");
  }

  if (spinner) spinner.succeed(chalk.green(`Xcode cleaned — freed ${formatBytes(freed)}`));

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  return { ok: true, paths: cleanedPaths, freed, errors };
}
