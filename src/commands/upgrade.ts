import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import chalk from "chalk";
import ora from "ora";
import { getLatestVersion, isNewer, runNpmUpgrade } from "../utils/version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, "..", "..", "package.json")) as { version: string; name: string };

export interface UpgradeOptions {
  json: boolean;
}

export async function runUpgrade(options: UpgradeOptions): Promise<void> {
  const currentVersion = pkg.version;
  const spinner = options.json ? null : ora("Checking latest version on npm...").start();

  const latestVersion = await getLatestVersion(10_000); // longer timeout for interactive upgrade

  if (!latestVersion) {
    if (spinner) spinner.fail("Could not reach npm registry — check your internet connection.");
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: "Could not reach npm registry" }));
    }
    process.exit(1);
  }

  if (!isNewer(currentVersion, latestVersion)) {
    if (spinner) spinner.succeed(chalk.green(`Already up to date — ${pkg.name}@${currentVersion}`));
    if (options.json) {
      console.log(JSON.stringify({ ok: true, data: { current: currentVersion, latest: latestVersion, upgraded: false } }));
    }
    return;
  }

  if (spinner) spinner.succeed(
    `Update available: ${chalk.gray(currentVersion)} → ${chalk.green(latestVersion)}`
  );

  if (!options.json) {
    console.log(chalk.bold(`\nUpgrading ${pkg.name} to v${latestVersion}...\n`));
  }

  const upgradeSpinner = options.json ? null : ora("Running npm install -g...").start();
  const { ok, error } = runNpmUpgrade(latestVersion);

  if (!ok) {
    if (upgradeSpinner) upgradeSpinner.fail(chalk.red(`Upgrade failed: ${error}`));
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error }));
    }
    process.exit(1);
  }

  if (upgradeSpinner) upgradeSpinner.succeed(chalk.green(`Upgraded to ${pkg.name}@${latestVersion} ✓`));

  if (options.json) {
    console.log(JSON.stringify({ ok: true, data: { current: currentVersion, latest: latestVersion, upgraded: true } }));
  } else {
    console.log(chalk.gray(`\nRun ${chalk.bold("mac-cleaner --version")} to confirm.`));
  }
}
