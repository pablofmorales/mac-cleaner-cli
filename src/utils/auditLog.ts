import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    // dist/utils/auditLog.js → dist/ → package.json (one level up)
    const raw = fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "unknown";
  }
}

export interface AuditEntry {
  timestamp: string;
  version: string;
  command: string;
  options: Record<string, unknown>;
  paths_deleted: string[];
  bytes_freed: number;
  errors: string[];
  user: string;
  machine: string;
}

const AUDIT_DIR = path.join(os.homedir(), ".mac-cleaner");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit.log");

/**
 * Appends a JSON line to ~/.mac-cleaner/audit.log.
 * File is created with mode 0o600 (owner read/write only).
 * Never throws — audit log failure must not crash the CLI.
 */
export function writeAuditLog(entry: Partial<AuditEntry> & { command: string; paths_deleted: string[]; bytes_freed: number; errors: string[] }): void {
  try {
    // Ensure directory exists
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true, mode: 0o700 });
    }

    const fullEntry: AuditEntry = {
      timestamp: new Date().toISOString(),
      version: getVersion(),
      command: entry.command,
      options: entry.options ?? {},
      paths_deleted: entry.paths_deleted,
      bytes_freed: entry.bytes_freed,
      errors: entry.errors,
      user: (() => { try { return os.userInfo().username; } catch { return "unknown"; } })(),
      machine: (() => { try { return os.hostname(); } catch { return "unknown"; } })(),
    };

    const line = JSON.stringify(fullEntry) + "\n";

    // Create with mode 0o600 on first write, then append
    const fileExists = fs.existsSync(AUDIT_FILE);
    if (!fileExists) {
      fs.writeFileSync(AUDIT_FILE, line, { mode: 0o600 });
    } else {
      fs.appendFileSync(AUDIT_FILE, line);
    }
  } catch {
    // Silently swallow — audit log must never crash the CLI
  }
}
