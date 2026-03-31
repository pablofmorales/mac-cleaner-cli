import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import chalk from "chalk";
import { CleanOptions, CleanResult } from "./types.js";
import { customHelpFormatter } from "./utils/helpFormatter.js";
import { COMMAND_GROUPS, getGroupForCommand } from "./commandGroups.js";
import { emitDeprecation } from "./utils/deprecation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version: string };

const program = new Command();

program
  .name("mac-cleaner")
  .description("Clean dev caches on macOS — npm, Homebrew, Docker, Xcode, browsers, and more")
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

// ─── Cleaner definitions (single source of truth) ──────────────────────────

interface CleanerDef {
  name: string;
  description: string;
  importPath: string;
  extraOptions?: (cmd: Command) => Command;
}

const CLEANERS: Record<string, CleanerDef> = {
  system:            { name: "system",          description: "Clean ~/Library/Caches, /tmp, and system logs",                                      importPath: "./cleaners/system.js" },
  brew:              { name: "brew",            description: "Run brew cleanup and autoremove",                                                     importPath: "./cleaners/brew.js" },
  node:              { name: "node",            description: "Clean npm/yarn/pnpm caches and orphan node_modules",                                  importPath: "./cleaners/node.js",
    extraOptions: (cmd) => cmd.option("--include-orphans", "Also delete orphan node_modules (use carefully in monorepos)", false),
  },
  browser:           { name: "browser",         description: "Clean Chrome, Firefox, Safari, Arc, and Brave caches",                                importPath: "./cleaners/browser.js" },
  docker:            { name: "docker",          description: "Prune Docker containers, images, volumes, and build cache",                           importPath: "./cleaners/docker.js" },
  xcode:             { name: "xcode",           description: "Clean Xcode DerivedData, device support files, and simulators",                       importPath: "./cleaners/xcode.js" },
  cloud:             { name: "cloud",           description: "Clean iCloud, Dropbox, Google Drive, and OneDrive cache directories",                 importPath: "./cleaners/cloud.js" },
  mail:              { name: "mail",            description: "Clean cached mail attachments and downloads from Apple Mail",                          importPath: "./cleaners/mail.js" },
  "mobile-backups":  { name: "mobile-backups",  description: "Clean old iOS/iPadOS device backups",                                                 importPath: "./cleaners/mobile.js" },
  all:               { name: "all",             description: "Run all cleaners in sequence with space recovery summary",                            importPath: "./cleaners/all.js" },
  privacy:           { name: "privacy",         description: "Remove recent files lists, Finder recents, and XDG recent files",                     importPath: "./cleaners/privacy.js" },
  keychain:          { name: "keychain",        description: "Audit macOS keychain entries (read-only -- nothing deleted)",                          importPath: "./cleaners/keychain.js" },
  maintain:          { name: "maintain",        description: "Run macOS maintenance tasks (DNS flush, Spotlight rebuild, disk permissions, etc.)",   importPath: "./cleaners/maintain.js" },
  startup:           { name: "startup",         description: "List and inspect Launch Agents and startup items (read-only audit)",                   importPath: "./cleaners/startup.js" },
  apps:              { name: "apps",            description: "Find and remove leftover files from uninstalled applications",                        importPath: "./cleaners/apps.js" },
  "large-files":     { name: "large-files",     description: "Find and remove large files (>100MB) not accessed recently",                          importPath: "./cleaners/largefiles.js",
    extraOptions: (cmd) => cmd
      .option("--min-size <size>", "Minimum file size threshold (e.g. 100M, 1G)", "100M")
      .option("--older-than <days>", "Only include files not accessed in this many days", "90"),
  },
  duplicates:        { name: "duplicates",      description: "Find and remove duplicate files in ~/Downloads, ~/Documents, ~/Desktop",              importPath: "./cleaners/duplicates.js",
    extraOptions: (cmd) => cmd.option("--min-size <size>", "Minimum file size to consider (e.g. 1M, 500K)", "1M"),
  },
};

// ─── Helper: register a cleaner command on a parent ────────────────────────

function registerCleaner(
  parent: Command,
  def: CleanerDef,
  opts?: { hidden?: boolean; deprecatedFrom?: string },
): void {
  let cmd = opts?.hidden
    ? parent.command(def.name, { hidden: true }).description(def.description)
    : parent.command(def.name).description(def.description);
  cmd = addCleanOptions(cmd);
  if (def.extraOptions) cmd = def.extraOptions(cmd);
  cmd.action(async (actionOpts: Record<string, any>) => {
    if (opts?.deprecatedFrom) {
      const group = getGroupForCommand(def.name);
      emitDeprecation(opts.deprecatedFrom, `${group} ${def.name}`);
    }
    const { clean } = await import(def.importPath);
    const result = await clean(actionOpts as CleanOptions);
    // all.ts handles its own JSON output (per-module breakdown)
    if (def.name === "all") {
      if (!actionOpts.json) outputResult(result, false);
    } else {
      outputResult(result, actionOpts.json);
    }
    process.exit(result.ok ? 0 : 1);
  });
}

// ─── Register group commands ───────────────────────────────────────────────

for (const [groupName, groupDef] of Object.entries(COMMAND_GROUPS)) {
  const groupCmd = program.command(groupName).description(groupDef.description);

  for (const cmdName of groupDef.commands) {
    // scan and disk-usage have custom action signatures, handled separately
    if (cmdName === "scan" || cmdName === "disk-usage") continue;

    const def = CLEANERS[cmdName];
    if (!def) continue;

    registerCleaner(groupCmd, def);
  }
}

// ─── Register scan under protection group ──────────────────────────────────

const protectionCmd = program.commands.find((c) => c.name() === "protection")!;

protectionCmd
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
    process.exit(result.findings.length > 0 ? 1 : 0);
  });

// ─── Register disk-usage under files group ─────────────────────────────────

const filesCmd = program.commands.find((c) => c.name() === "files")!;

filesCmd
  .command("disk-usage")
  .description("Show visual breakdown of disk usage by directory (Space Lens)")
  .argument("[path]", "Directory to scan (default: home directory)")
  .option("--json", "Output results as JSON", false)
  .action(async (pathArg: string | undefined, opts: { json: boolean }) => {
    const { runDiskUsage } = await import("./commands/diskusage.js");
    await runDiskUsage({ json: opts.json, path: pathArg });
  });

// ─── Deprecated top-level aliases ──────────────────────────────────────────

for (const [cmdName, def] of Object.entries(CLEANERS)) {
  registerCleaner(program, def, { hidden: true, deprecatedFrom: cmdName });
}

// Deprecated top-level scan
program.command("scan", { hidden: true })
  .description("Scan for secrets")
  .option("--json", "Output results as JSON", false)
  .option("-v, --verbose", "Show redacted previews of each finding", false)
  .action(async (opts: { json: boolean; verbose: boolean }) => {
    emitDeprecation("scan", "protection scan");
    const { scan } = await import("./cleaners/secrets.js");
    const result = await scan(opts);
    if (opts.json) {
      console.log(JSON.stringify({ ok: result.ok, data: { findings: result.findings, scannedFiles: result.scannedFiles }, error: result.errors.length ? result.errors : null }));
    }
    process.exit(result.findings.length > 0 ? 1 : 0);
  });

// Deprecated top-level disk-usage
program.command("disk-usage", { hidden: true })
  .description("Show visual breakdown of disk usage by directory (Space Lens)")
  .argument("[path]", "Directory to scan (default: home directory)")
  .option("--json", "Output results as JSON", false)
  .action(async (pathArg: string | undefined, opts: { json: boolean }) => {
    emitDeprecation("disk-usage", "files disk-usage");
    const { runDiskUsage } = await import("./commands/diskusage.js");
    await runDiskUsage({ json: opts.json, path: pathArg });
  });

// Deprecated `clean` parent command
const cleanCmd = program.command("clean", { hidden: true }).description("Clean specific cache categories");
for (const [cmdName, def] of Object.entries(CLEANERS)) {
  registerCleaner(cleanCmd, def, { deprecatedFrom: `clean ${cmdName}` });
}

// Deprecated clean scan
cleanCmd.command("scan")
  .description("Scan for secrets")
  .option("--json", "Output results as JSON", false)
  .option("-v, --verbose", "Show redacted previews of each finding", false)
  .action(async (opts: { json: boolean; verbose: boolean }) => {
    emitDeprecation("clean scan", "protection scan");
    const { scan } = await import("./cleaners/secrets.js");
    const result = await scan(opts);
    if (opts.json) {
      console.log(JSON.stringify({ ok: result.ok, data: { findings: result.findings, scannedFiles: result.scannedFiles }, error: result.errors.length ? result.errors : null }));
    }
    process.exit(result.findings.length > 0 ? 1 : 0);
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

// ─── status ─────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show system health overview — disk, memory, uptime, reclaimable space")
  .option("--json", "Output result as JSON", false)
  .action(async (opts: { json: boolean }) => {
    const { runStatus } = await import("./commands/status.js");
    await runStatus(opts);
  });

// ─── Parse & default behavior ───────────────────────────────────────────────

const args = process.argv.slice(2);
const isVersionFlag = args.includes("--version") || args.includes("-V");

{
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
          `\n${chalk.bold("New version available:")} ${chalk.gray(pkg.version)} -> ${chalk.green(latest)}` +
          `\n   Run: ${chalk.bold("npm install -g @blackasteroid/mac-cleaner-cli")} to update\n`
        );
      }
    })();
  }
}
