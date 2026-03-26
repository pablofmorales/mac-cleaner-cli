import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import chalk from "chalk";
import { CleanOptions, CleanResult } from "./types.js";
import { customHelpFormatter } from "./utils/helpFormatter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version: string };

const program = new Command();

program
  .name("mac-cleaner")
  .description("🧹 Clean dev caches on macOS — npm, Homebrew, Docker, Xcode, browsers, and more")
  .version(pkg.version)
  .configureHelp({ formatHelp: (cmd, helper) => customHelpFormatter(cmd, helper) });

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
    .option("-y, --yes", "Non-interactive mode: skip sudo prompt (CI-safe)", false)
    .option("--secure-delete", "Overwrite files with zeros before deletion (macOS only, files only)", false);
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

// clean keychain
addCleanOptions(
  cleanCmd
    .command("keychain")
    .description("Audit macOS keychain entries (read-only — nothing deleted)")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/keychain.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean privacy
addCleanOptions(
  cleanCmd
    .command("privacy")
    .description("Remove recent files lists, Finder recents, and XDG recent files")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/privacy.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean mobile-backups
addCleanOptions(
  cleanCmd
    .command("mobile-backups")
    .description("Clean old iOS/iPadOS device backups")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/mobile.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean maintain
addCleanOptions(
  cleanCmd
    .command("maintain")
    .description("Run macOS maintenance tasks (DNS flush, Spotlight rebuild, disk permissions, etc.)")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/maintain.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean large-files
addCleanOptions(
  cleanCmd
    .command("large-files")
    .description("Find and remove large files (>100MB) not accessed recently")
    .option("--min-size <size>", "Minimum file size threshold (e.g. 100M, 1G)", "100M")
    .option("--older-than <days>", "Only include files not accessed in this many days", "90")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean; minSize: string; olderThan: string }) => {
  const { clean } = await import("./cleaners/largefiles.js");
  const result = await clean({ ...opts, minSize: opts.minSize, olderThan: opts.olderThan } as any);
// clean startup
addCleanOptions(
  cleanCmd
    .command("startup")
    .description("List and inspect Launch Agents and startup items (read-only audit)")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/startup.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean all
addCleanOptions(
  cleanCmd
    .command("all")
    .description("Run all cleaners in sequence with space recovery summary")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/all.js");
  const result = await clean(opts as CleanOptions);
  // all.ts handles its own JSON output (per-module breakdown); skip outputResult for JSON
  if (!opts.json) outputResult(result, false);
  process.exit(result.ok ? 0 : 1);
});

// ─── Top-level shorthands ───────────────────────────────────────────────────

addCleanOptions(
  program
    .command("system")
    .description("Remove system logs, temp files & caches")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/system.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("brew")
    .description("Clear Homebrew cache & old package versions")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/brew.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("node")
    .description("Wipe node_modules caches & npm/yarn/pnpm stores")
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
    .description("Remove browser caches (Chrome, Safari, Firefox, Arc)")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/browser.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("docker")
    .description("Delete unused images, containers & volumes")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/docker.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("xcode")
    .description("Clear Xcode derived data & simulator caches")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean }) => {
  const { clean } = await import("./cleaners/xcode.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("keychain")
    .description("Audit stale Keychain entries (read-only)")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/keychain.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("privacy")
    .description("Clear app usage history & recent files")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/privacy.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("mobile-backups")
    .description("Clean old iOS/iPadOS device backups")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/mobile.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("maintain")
    .description("Run macOS maintenance tasks (DNS, Spotlight, permissions, etc.)")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/maintain.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("large-files")
    .description("Find and remove large & old files in ~/Downloads, ~/Desktop, ~/Documents")
    .option("--min-size <size>", "Minimum file size threshold (e.g. 100M, 1G)", "100M")
    .option("--older-than <days>", "Only include files not accessed in this many days", "90")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean; minSize: string; olderThan: string }) => {
  const { clean } = await import("./cleaners/largefiles.js");
  const result = await clean({ ...opts, minSize: opts.minSize, olderThan: opts.olderThan } as any);
    .command("startup")
    .description("List and inspect Launch Agents and startup items")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/startup.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("all")
    .description("Clean everything at once (safe defaults)")
).action(async (opts: { dryRun: boolean; json: boolean; verbose: boolean; noSudo: boolean; yes: boolean; secureDelete: boolean }) => {
  const { clean } = await import("./cleaners/all.js");
  const result = await clean(opts as CleanOptions);
  // all.ts handles its own JSON output (per-module breakdown); skip outputResult for JSON
  if (!opts.json) outputResult(result, false);
  process.exit(result.ok ? 0 : 1);
});

// ─── scan ──────────────────────────────────────────────────────────────────

program
  .command("scan")
  .description("Scan caches and config files for accidentally exposed secrets (does not delete)")
  .option("--json", "Output results as JSON", false)
  .option("-v, --verbose", "Show redacted previews of each finding", false)
  .action(async (opts: { json: boolean; verbose: boolean }) => {
    const { scan } = await import("./cleaners/secrets.js");
    const result = await scan(opts);
    if (opts.json) {
      console.log(JSON.stringify({ ok: result.ok, data: { findings: result.findings, scannedFiles: result.scannedFiles }, error: result.errors.length ? result.errors : null }));
    }
    process.exit(result.findings.length > 0 ? 1 : 0); // non-zero exit when secrets found (CI-friendly)
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

// ─── TUI mode ──────────────────────────────────────────────────────────────

program
  .command("menu")
  .description("Launch interactive TUI dashboard")
  .action(async () => {
    const { launchTui } = await import("./tui/index.js");
    await launchTui();
  });

// ─── Parse & default behavior ───────────────────────────────────────────────

const args = process.argv.slice(2);
const hasCommand = args.length > 0 && !args[0].startsWith("-");
const isVersionFlag = args.includes("--version") || args.includes("-V");

if (!hasCommand && !isVersionFlag && process.stdout.isTTY) {
  // No subcommand given in a TTY -- launch TUI
  void (async () => {
    const { launchTui } = await import("./tui/index.js");
    await launchTui();
  })();
} else {
  program.parse(process.argv);

  // Version check hint on --help
  const isHelp = args[0] === "--help" || args[0] === "-h";
  const isJsonFlag = args.includes("--json");
  const isUpgrade = args[0] === "upgrade";
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
}
