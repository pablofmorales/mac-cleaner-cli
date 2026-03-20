import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
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
    .option("--json", "Output results as JSON", false);
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
).action(async (opts: { dryRun: boolean; json: boolean }) => {
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
).action(async (opts: { dryRun: boolean; json: boolean }) => {
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
).action(async (opts: { dryRun: boolean; json: boolean }) => {
  const { clean } = await import("./cleaners/node.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

// clean browser
addCleanOptions(
  cleanCmd
    .command("browser")
    .description("Clean Chrome, Firefox, Safari, Arc, and Brave caches")
).action(async (opts: { dryRun: boolean; json: boolean }) => {
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
).action(async (opts: { dryRun: boolean; json: boolean }) => {
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
).action(async (opts: { dryRun: boolean; json: boolean }) => {
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
).action(async (opts: { dryRun: boolean; json: boolean }) => {
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
).action(async (opts: { dryRun: boolean; json: boolean }) => {
  const { clean } = await import("./cleaners/system.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("brew")
    .description("Shorthand for: clean brew")
).action(async (opts: { dryRun: boolean; json: boolean }) => {
  const { clean } = await import("./cleaners/brew.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("node")
    .description("Shorthand for: clean node")
).action(async (opts: { dryRun: boolean; json: boolean }) => {
  const { clean } = await import("./cleaners/node.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("browser")
    .description("Shorthand for: clean browser")
).action(async (opts: { dryRun: boolean; json: boolean }) => {
  const { clean } = await import("./cleaners/browser.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("docker")
    .description("Shorthand for: clean docker")
).action(async (opts: { dryRun: boolean; json: boolean }) => {
  const { clean } = await import("./cleaners/docker.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("xcode")
    .description("Shorthand for: clean xcode")
).action(async (opts: { dryRun: boolean; json: boolean }) => {
  const { clean } = await import("./cleaners/xcode.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

addCleanOptions(
  program
    .command("all")
    .description("Shorthand for: clean all")
).action(async (opts: { dryRun: boolean; json: boolean }) => {
  const { clean } = await import("./cleaners/all.js");
  const result = await clean(opts as CleanOptions);
  outputResult(result, opts.json);
  process.exit(result.ok ? 0 : 1);
});

program.parse(process.argv);
