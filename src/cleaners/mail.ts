import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions, CleanResult } from "../types.js";
import { duBytes, formatBytes } from "../utils/du.js";
import { renderSummaryTable, verboseLine, truncatePath } from "../utils/format.js";
import { writeAuditLog } from "../utils/auditLog.js";

const home = os.homedir();

const MAIL_PATHS = [
  path.join(home, "Library", "Containers", "com.apple.mail", "Data", "Library", "Mail Downloads"),
  path.join(home, "Library", "Mail Downloads"),
  path.join(home, "Library", "Containers", "com.apple.mail", "Data", "DataVaults"),
];

export async function clean(options: CleanOptions): Promise<CleanResult> {
  const spinner = options.json ? null : createSpinner("Scanning mail attachments & downloads...").start();
  const errors: string[] = [];
  const cleanedPaths: string[] = [];
  let freed = 0;

  // Gather children from each existing mail path
  const allCandidates: Array<{ label: string; path: string }> = [];

  for (const dir of MAIL_PATHS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        allCandidates.push({ label: path.basename(dir), path: path.join(dir, entry) });
      }
    } catch {
      // directory unreadable — skip
    }
  }

  if (allCandidates.length === 0) {
    if (spinner) spinner.info("No mail attachments or downloads found");
    return { ok: true, paths: [], freed: 0, errors };
  }

  if (options.dryRun) {
    if (spinner) spinner.succeed(chalk.yellow("Dry run -- nothing deleted"));
    for (const { label, path: p } of allCandidates) {
      const size = duBytes(p);
      if (options.verbose && !options.json) {
        verboseLine(label, p, size, true);
      }
      cleanedPaths.push(p);
      freed += size;
    }
    if (!options.json && !(options as any)._suppressTable) {
      renderSummaryTable([{ module: "Mail", paths: cleanedPaths.length, freed, status: "would_free", warnings: errors.length }], true);
    }
    return { ok: true, paths: cleanedPaths, freed, errors };
  }

  if (spinner) spinner.text = `Cleaning ${allCandidates.length} mail cache paths...`;

  for (const { label, path: p } of allCandidates) {
    if (spinner) spinner.text = `[${label}] Cleaning: ${truncatePath(p)}`;
    const size = duBytes(p);
    try {
      // #41: Secure delete — overwrite file with zeros before removal (macOS, files only)
      if (options.secureDelete && process.platform === "darwin") {
        let stat: fs.Stats | null = null;
        try { stat = fs.statSync(p); } catch { /* ignore */ }
        if (stat?.isFile()) {
          if (options.verbose && !options.json) {
            console.log(chalk.gray(`    [secure-delete] overwriting ${p}`));
          }
          if (stat && stat.size > 0) {
            try { fs.writeFileSync(p, Buffer.alloc(stat.size)); } catch { /* best-effort */ }
          }
        }
      }
      fs.rmSync(p, { recursive: true, force: true });
      cleanedPaths.push(p);
      freed += size;
      if (options.verbose && !options.json) {
        verboseLine(label, p, size, false);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("EPERM") || msg.includes("EACCES")) {
        errors.push(`Skipped (protected by macOS): ${p}`);
      } else {
        errors.push(`Failed to remove ${p}: ${msg}`);
      }
    }
  }

  if (spinner) spinner.succeed(chalk.green("Mail attachments & downloads cleaned"));

  if (!options.json && !(options as any)._suppressTable) {
    renderSummaryTable([{ module: "Mail", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length }]);
  }

  if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }

  // #44: Audit log
  writeAuditLog({
    command: "clean mail",
    options: { dryRun: options.dryRun, json: options.json, verbose: options.verbose, secureDelete: options.secureDelete },
    paths_deleted: cleanedPaths,
    bytes_freed: freed,
    errors,
  });

  return { ok: true, paths: cleanedPaths, freed, errors };
}
