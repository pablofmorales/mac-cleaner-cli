import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { renderSummaryTable, SummaryRow } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

interface AgentInfo {
  plistPath: string;
  label: string;
  program: string;
  loaded: boolean;
  location: "user" | "global" | "system";
}

/**
 * Read a single key from a plist file using `defaults read`.
 * Returns the value string or null on failure.
 */
function readPlistKey(plistPath: string, key: string): string | null {
  const result = spawnSync("defaults", ["read", plistPath, key], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return null;
}

/**
 * Parse ProgramArguments output from `defaults read`.
 * The output is an NSArray printed as:
 *   (
 *       "/usr/bin/something",
 *       "-flag"
 *   )
 * We extract the first element as the program.
 */
function parseProgramArguments(raw: string): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== "(" && l !== ")");
  if (lines.length === 0) return "unknown";
  // Remove surrounding quotes and trailing comma
  let first = lines[0];
  first = first.replace(/^"/, "").replace(/"?,?$/, "");
  return first || "unknown";
}

/**
 * Get the set of loaded agent labels via `launchctl list`.
 */
function getLoadedLabels(): Set<string> {
  const result = spawnSync("launchctl", ["list"], {
    encoding: "utf8",
    timeout: 10000,
  });
  const labels = new Set<string>();
  if (result.status === 0 && result.stdout) {
    const lines = result.stdout.split("\n").slice(1); // skip header
    for (const line of lines) {
      const parts = line.trim().split(/\t/);
      if (parts.length >= 3) {
        labels.add(parts[2]);
      }
    }
  }
  return labels;
}

/**
 * List plist files in a directory, gracefully handling missing/unreadable dirs.
 */
function listPlists(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  try {
    return fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".plist"))
      .map((f) => path.join(dirPath, f));
  } catch {
    return [];
  }
}

/**
 * #99 -- Launch Agents / startup items manager
 *
 * Scans LaunchAgents and LaunchDaemons directories, reporting what
 * runs at startup. Read-only audit by default; in non-dry-run mode
 * removes user agents only.
 */
export async function clean(options: CleanOptions): Promise<CleanResult> {
  const suppressTable = (options as any)._suppressTable === true;
  const spinner = options.json ? null : createSpinner("Scanning launch agents...").start();
  const errors: string[] = [];
  const discoveredPaths: string[] = [];
  const removedPaths: string[] = [];

  const userAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
  const globalAgentsDir = "/Library/LaunchAgents";
  const systemDaemonsDir = "/Library/LaunchDaemons";

  const scanDirs: Array<{ dir: string; location: AgentInfo["location"] }> = [
    { dir: userAgentsDir, location: "user" },
    { dir: globalAgentsDir, location: "global" },
    { dir: systemDaemonsDir, location: "system" },
  ];

  // Gather loaded labels once
  const loadedLabels = getLoadedLabels();

  const agents: AgentInfo[] = [];

  for (const { dir, location } of scanDirs) {
    const plists = listPlists(dir);
    for (const plistPath of plists) {
      discoveredPaths.push(plistPath);

      const label = readPlistKey(plistPath, "Label") || path.basename(plistPath, ".plist");

      const progRaw = readPlistKey(plistPath, "ProgramArguments");
      let program = "unknown";
      if (progRaw) {
        program = parseProgramArguments(progRaw);
      } else {
        // Some plists use Program instead of ProgramArguments
        const prog = readPlistKey(plistPath, "Program");
        if (prog) program = prog;
      }

      const loaded = loadedLabels.has(label);

      agents.push({ plistPath, label, program, loaded, location });
    }
  }

  if (spinner) spinner.text = `Found ${agents.length} launch agents/daemons`;

  // -- Dry run or normal listing mode ----------------------------------------
  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run -- listing startup items only"));

    if (!options.json && !suppressTable && options.verbose) {
      printAgentDetails(agents);
    }

    if (!options.json && !suppressTable) {
      printSummary(agents, true);
    }

    writeAuditLog({
      command: "clean startup",
      options: { dryRun: true, json: options.json, verbose: options.verbose },
      paths_deleted: [],
      bytes_freed: 0,
      errors,
    });

    return {
      ok: true,
      paths: discoveredPaths,
      freed: 0,
      errors,
    };
  }

  // -- Real mode: remove user agents only ------------------------------------
  const userAgents = agents.filter((a) => a.location === "user");
  const nonUserAgents = agents.filter((a) => a.location !== "user");

  for (const agent of userAgents) {
    try {
      // Unload before removing if currently loaded
      if (agent.loaded) {
        spawnSync("launchctl", ["unload", agent.plistPath], {
          encoding: "utf8",
          timeout: 5000,
        });
      }
      fs.rmSync(agent.plistPath, { force: true });
      removedPaths.push(agent.plistPath);
      if (options.verbose && !options.json) {
        console.log(chalk.gray(`    Removed: ${agent.label} (${agent.plistPath})`));
      }
    } catch (err) {
      errors.push(`Failed to remove ${agent.plistPath}: ${(err as Error).message}`);
    }
  }

  if (spinner) spinner.succeed(chalk.green("Startup items scan complete"));

  if (!options.json && !suppressTable) {
    if (options.verbose) {
      printAgentDetails(nonUserAgents);
    }
    printSummary(agents, false, removedPaths.length);
    if (nonUserAgents.length > 0) {
      console.log(
        chalk.yellow(
          `\n  ! Global agents and system daemons are read-only -- ${nonUserAgents.length} item(s) listed but not removed.`,
        ),
      );
    }
  }

  writeAuditLog({
    command: "clean startup",
    options: { dryRun: false, json: options.json, verbose: options.verbose },
    paths_deleted: removedPaths,
    bytes_freed: 0,
    errors,
  });

  return {
    ok: true,
    paths: discoveredPaths,
    freed: 0,
    errors,
  };
}

// -- Display helpers ---------------------------------------------------------

function printAgentDetails(agents: AgentInfo[]): void {
  if (agents.length === 0) return;

  console.log(chalk.cyan("\n  Launch agents / daemons:"));
  console.log(
    chalk.gray(
      `    ${"Label".padEnd(40)} ${"Program".padEnd(30)} ${"Loaded".padEnd(8)} Location`,
    ),
  );
  console.log(chalk.gray(`    ${"─".repeat(40)} ${"─".repeat(30)} ${"─".repeat(8)} ${"─".repeat(10)}`));

  for (const a of agents) {
    const labelStr = a.label.length > 38 ? a.label.slice(0, 37) + "~" : a.label;
    const progStr =
      a.program.length > 28 ? a.program.slice(0, 27) + "~" : a.program;
    const loadedStr = a.loaded ? chalk.green("yes") : chalk.gray("no ");
    const locStr =
      a.location === "user"
        ? chalk.blue(a.location)
        : a.location === "global"
          ? chalk.yellow(a.location)
          : chalk.red(a.location);
    console.log(
      chalk.gray(`    ${labelStr.padEnd(40)} ${progStr.padEnd(30)} `) +
        loadedStr.padEnd(8 + 10) + // account for chalk escape codes
        ` ${locStr}`,
    );
  }
}

function printSummary(
  agents: AgentInfo[],
  dryRun: boolean,
  removedCount = 0,
): void {
  const userCount = agents.filter((a) => a.location === "user").length;
  const globalCount = agents.filter((a) => a.location === "global").length;
  const systemCount = agents.filter((a) => a.location === "system").length;
  const loadedCount = agents.filter((a) => a.loaded).length;

  console.log(chalk.cyan("\n  Startup items summary:"));
  console.log(chalk.gray(`    User agents:     ${userCount}`));
  console.log(chalk.gray(`    Global agents:   ${globalCount}`));
  console.log(chalk.gray(`    System daemons:  ${systemCount}`));
  console.log(chalk.gray(`    Currently loaded: ${loadedCount}`));

  if (!dryRun && removedCount > 0) {
    console.log(chalk.green(`    Removed:         ${removedCount} user agent(s)`));
  }

  if (dryRun) {
    console.log(chalk.yellow("\n  ! Startup items audit is read-only -- no items removed."));
  }
}
