import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import { createSpinner } from "../utils/spinner.js";
import { CleanOptions } from "../types.js";

export interface SecretFinding {
  file: string;
  line: number;
  type: string;
  preview: string; // redacted snippet — never logs the actual secret
}

export interface ScanResult {
  ok: boolean;
  findings: SecretFinding[];
  scannedFiles: number;
  errors: string[];
}

const home = os.homedir();

// Patterns to detect — all redact the actual secret in the preview
const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "AWS Access Key",       regex: /(AKIA|ABIA|ACCA)[A-Z0-9]{16}/ },
  { name: "AWS Secret Key",       regex: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/i },
  { name: "GitHub Token",         regex: /ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}/ },
  { name: "npm Token",            regex: /npm_[A-Za-z0-9]{36}/ },
  { name: "Generic API Key",      regex: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/i },
  { name: "Private Key (PEM)",    regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: "Bearer Token",         regex: /bearer\s+[A-Za-z0-9._\-]{20,}/i },
  { name: "Database URL",         regex: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/ },
  { name: "Slack Webhook",        regex: /hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/ },
  { name: "Stripe Key",           regex: /sk_live_[A-Za-z0-9]{24}/ },
  { name: "Google API Key",       regex: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: "Generic Secret",       regex: /(?:secret|password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9_\-!@#$%]{12,}["']?/i },
];

// Paths to scan for accidentally exposed secrets
const SCAN_PATHS: Array<{ path: string; label: string; maxSizeBytes?: number }> = [
  { path: path.join(home, ".npmrc"),                                  label: "npm config" },
  { path: path.join(home, ".env"),                                    label: "dotenv root" },
  { path: path.join(home, ".git-credentials"),                        label: "git credentials" },
  { path: path.join(home, ".bash_history"),                           label: "bash history",    maxSizeBytes: 512 * 1024 },
  { path: path.join(home, ".zsh_history"),                            label: "zsh history",     maxSizeBytes: 512 * 1024 },
  { path: path.join(home, ".config", "gh", "hosts.yml"),              label: "gh CLI config" },
  { path: path.join(home, "Library", "Caches", "pip"),                label: "pip cache" },
  { path: path.join(home, ".docker", "config.json"),                  label: "docker config" },
  { path: path.join(home, ".aws", "credentials"),                     label: "AWS credentials" },
];

function redact(text: string, regex: RegExp): string {
  return text.replace(regex, (match) => {
    const visible = match.slice(0, 6);
    return `${visible}${"*".repeat(Math.max(0, match.length - 6))}`;
  });
}

function scanFile(filePath: string, label: string, findings: SecretFinding[], errors: string[]): number {
  if (!fs.existsSync(filePath)) return 0;

  let content: string;
  try {
    const stat = fs.statSync(filePath);
    // Skip very large files
    if (stat.size > 2 * 1024 * 1024) {
      errors.push(`Skipped (too large): ${filePath}`);
      return 0;
    }
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return 0;
  }

  const lines = content.split("\n");
  let scanned = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, regex } of SECRET_PATTERNS) {
      if (regex.test(line)) {
        findings.push({
          file: `${label} (${filePath})`,
          line: i + 1,
          type: name,
          preview: redact(line.trim().slice(0, 80), regex),
        });
      }
    }
  }

  return scanned;
}

export async function scan(options: Pick<CleanOptions, "json" | "verbose">): Promise<ScanResult> {
  const spinner = options.json ? null : createSpinner("Scanning for exposed secrets...").start();
  const findings: SecretFinding[] = [];
  const errors: string[] = [];
  let scannedFiles = 0;

  for (const { path: p, label } of SCAN_PATHS) {
    const count = scanFile(p, label, findings, errors);
    scannedFiles += count;
  }

  if (spinner) {
    if (findings.length > 0) {
      spinner.warn(chalk.yellow(`Found ${findings.length} potential secret(s) in ${scannedFiles} file(s)`));
    } else {
      spinner.succeed(chalk.green(`No secrets found in ${scannedFiles} scanned file(s)`));
    }
  }

  if (!options.json && findings.length > 0) {
    console.log();
    for (const f of findings) {
      console.log(chalk.red(`  ⚠️  ${f.type}`) + chalk.gray(` — ${f.file}:${f.line}`));
      if (options.verbose) {
        console.log(chalk.gray(`     ${f.preview}`));
      }
    }
    console.log();
    console.log(chalk.yellow("  Rotate any exposed credentials before cleaning caches."));
    console.log(chalk.gray("  Run with --verbose to see redacted previews."));
  }

  return { ok: true, findings, scannedFiles, errors };
}
