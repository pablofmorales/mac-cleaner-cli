import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import chalk from "chalk";
import { CleanOptions, CleanResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version: string };

const program = new Command();

program
  .name("mac-cleaner")
  .description("🧹 Clean dev caches on macOS — npm, Homebrew, Docker, Xcode, browsers, and more")
  .version(pkg.version);

// ─── Helper to output results ──────────────────────────────────────────────

function outputResult(result: CleanResult, jsonMode: boolean): void {
  if (jsonMode) {
    console.log(
      JSON.stringify({
        ok: result.ok,
        data: { freed: result.freed, paths: result.paths },
        error: result.errors.length ? result.errors : null,
      })
    );
  }
}

// ─── Shared option adder ───────────────────────────────────────────────────

function addCleanOptions(cmd: Command): Command {
  return cmd
    .option("--dry-run", "Show what would be deleted without actually deleting", false)
    .option("--json", "Output results as JSON", false)
    .option("-v, --verbose", "Show each path as it is cleaned (default: summary table only)", false)
    .option("--no-sudo", "Skip privileged paths without prompting for sudo")
    .option("-y, --yes", "Non-interactive mode: skip sudo prompt (CI-safe)", false);
}

// ─── clean <subcommand> group ───────────────────────────────────────────────

const cleanCmd = program
  .command("clean")
  .description("Clean specific cache categories");

// clean system
addCleanOptions(
  cleanCmd
    .command("system")
    .description("Clean ~/Library/Caches, /tmp, and system logs")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/system.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean brew
addCleanOptions(
  cleanCmd
    .command("brew")
    .description("Run brew cleanup and autoremove")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/brew.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean node
addCleanOptions(
  cleanCmd
    .command("node")
    .description("Clean npm/yarn/pnpm caches and orphan node_modules")
    .option("--include-orphans", "Also delete orphan node_modules (use carefully in monorepos)", false)
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; includeOrphans: boolean }) => {
  const { clean } = await import("./cleaners/node.js");
  const result = await clean(opts);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean browser
addCleanOptions(
  cleanCmd
    .command("browser")
    .description("Clean Chrome, Firefox, Safari, Arc, and Brave caches")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/browser.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean docker
addCleanOptions(
  cleanCmd
    .command("docker")
    .description("Prune Docker containers, images, volumes, and build cache")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/docker.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean xcode
addCleanOptions(
  cleanCmd
    .command("xcode")
    .description("Clean Xcode DerivedData, device support files, and simulators")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/xcode.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean all
addCleanOptions(
  cleanCmd
    .command("all")
    .description("Run all cleaners in sequence with space recovery summary")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/all.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// ─── Top-level shorthands ───────────────────────────────────────────────────

addCleanOptions(
  program
    .command("system")
    .description("Shorthand for: clean system")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/system.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("brew")
    .description("Shorthand for: clean brew")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/brew.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("node")
    .description("Shorthand for: clean node")
    .option("--include-orphans", "Also delete orphan node_modules (use carefully in monorepos)", false)
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; includeOrphans: boolean }) => {
  const { clean } = await import("./cleaners/node.js");
  const result = await clean(opts);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("browser")
    .description("Shorthand for: clean browser")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/browser.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("docker")
    .description("Shorthand for: clean docker")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/docker.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("xcode")
    .description("Shorthand for: clean xcode")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/xcode.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("all")
    .description("Shorthand for: clean all")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/all.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// ─── upgrade ───────────────────────────────────────────────────────────────

program
  .command("upgrade")
  .description("Upgrade mac-cleaner to the latest version from npm")
  .option("--json", "Output result as JSON", false)
  .action(async (opts: { json: boolean }) => {
    const { runUpgrade } = await import("./commands/upgrade.js");
    await runUpgrade(opts);
  });

// ─── Version check on startup (no args / --help) ───────────────────────────
// Only runs when the user invokes with no subcommand and is not piped (TTY check)

const args = process.argv.slice(2);
const isHelp = args.length === 0 || args[0] === "--help" || args[0] === "-h";
const isJsonFlag = args.includes("--json");
const isUpgrade = args[0] === "upgrade";

program.parse(process.argv);

// After parsing, show version check hint if running with no args or --help
if (isHelp && !isJsonFlag && !isUpgrade && process.stdout.isTTY) {
  void (async () => {
    const { getLatestVersionCached, isNewer } = await import("./utils/version.js");
    const latest = await getLatestVersionCached(2500);
    if (latest && isNewer(pkg.version, latest)) {
      console.log(
        `\n💡 ${chalk.bold("New version available:")} ${chalk.gray(pkg.version)} → ${chalk.green(latest)}` +
        `\n   Run: ${chalk.bold("npm install -g @blackasteroid/mac-cleaner-cli")} to update\n`
      );
    }
  })();
}
