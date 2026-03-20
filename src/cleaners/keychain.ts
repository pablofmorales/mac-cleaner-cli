import { spawnSync } from "child_process";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { renderSummaryTable } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

/**
 * #46 — Keychain cleaner (read-only audit)
 * Scans the macOS keychain and reports entry counts.
 * Does NOT delete anything — freed is always 0.
 */
export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : createSpinner("Scanning keychain...").start();
  const errors: string[] = [];

  let genericPasswordCount = 0;
  let totalKeychainItems = 0;
  const appNames: string[] = [];

  // Count generic password entries
  const gpResult = spawnSync(
    "sh",
    ["-c", "security find-generic-password -a $USER 2>/dev/null | grep -c 'svce'"],
    { encoding: "utf8", timeout: 10000 }
  );
  if (gpResult.status === 0 && gpResult.stdout) {
    const n = parseInt(gpResult.stdout.trim(), 10);
    if (!isNaN(n)) genericPasswordCount = n;
  }

  // Count total keychain items via dump (grep for "keychain:" lines)
  const dumpResult = spawnSync(
    "sh",
    ["-c", "security dump-keychain 2>/dev/null | grep -c 'keychain:'"],
    { encoding: "utf8", timeout: 15000 }
  );
  if (dumpResult.status === 0 && dumpResult.stdout) {
    const n = parseInt(dumpResult.stdout.trim(), 10);
    if (!isNaN(n)) totalKeychainItems = n;
  }

  // In verbose mode, list application names (no secrets)
  if (options.verbose && !options.json) {
    const listResult = spawnSync(
      "sh",
      ["-c", "security find-generic-password -a $USER 2>/dev/null | grep 'svce' | sed 's/.*\"svce\"<blob>=\"\\(.*\\)\"/\\1/'"],
      { encoding: "utf8", timeout: 10000 }
    );
    if (listResult.stdout) {
      const names = listResult.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("<") && l !== "0x00000007");
      appNames.push(...names.slice(0, 50)); // cap at 50 for sanity
    }
  }

  if (spinner) spinner.succeed(chalk.green("Keychain scan complete"));

  if (!options.json && !(options as any)._suppressTable) {
    console.log(chalk.cyan(`\n  Keychain summary:`));
    console.log(chalk.gray(`    Generic password entries (current user): ${genericPasswordCount}`));
    console.log(chalk.gray(`    Total keychain items: ${totalKeychainItems}`));
    if (options.verbose && appNames.length > 0) {
      console.log(chalk.gray(`\n  Application names found in keychain:`));
      for (const name of appNames) {
        console.log(chalk.gray(`    • ${name}`));
      }
    }
    console.log(chalk.yellow(`\n  ⚠ Keychain is read-only — no items deleted.`));
  }

  if (options.json) {
    const output = {
      ok: true,
      data: {
        genericPasswordEntries: genericPasswordCount,
        totalKeychainItems,
        note: "Read-only audit — nothing deleted",
      },
      error: errors.length ? errors : null,
    };
    // BUG-01 fix: don't print JSON directly here — index.ts/outputResult handles
    // all JSON output uniformly. Standalone console.log breaks clean all --json.
    void output; // used for type-checking only
  }

  const result: CleanResult = {
    ok: true,
    paths: [],
    freed: 0,
    errors,
  };

  // #44: Audit log
  writeAuditLog({
    command: "clean keychain",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose },
    paths_deleted: [],
    bytes_freed: 0,
    errors,
  });

  return result;
}
