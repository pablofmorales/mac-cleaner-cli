import { spawnSync } from "child_process";
import * as readline from "readline";
import { isPrivilegedPath } from "./privilegedPaths.js";

/**
 * Prompt the user for a sudo password using masked input.
 * Returns the entered password, or empty string if user skips.
 * 
 * Uses readline with raw mode to hide the input.
 * Never stores or logs the password.
 */
export async function promptSudoPassword(paths: string[]): Promise<string> {
  return new Promise((resolve) => {
    // Fix #48: write prompt to stderr to avoid interference with ora spinner
    // output buffering on stdout. stderr is unbuffered and always visible.
    process.stderr.write(`\n  🔒 ${paths.length} path(s) require elevated privileges:\n`);
    for (const p of paths.slice(0, 5)) {
      process.stderr.write(`     ${p}\n`);
    }
    if (paths.length > 5) {
      process.stderr.write(`     ... and ${paths.length - 5} more\n`);
    }
    process.stderr.write("\n  Enter sudo password to include these (or press Enter to skip): ");

    // Fix #48: use stderr for output so readline doesn't write to stdout
    // and interfere with ora spinner's ANSI control sequences
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    // Hide input characters
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    let password = "";

    const onData = (char: Buffer) => {
      const ch = char.toString("utf8");

      if (ch === "\r" || ch === "\n") {
        // Enter pressed
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener("data", onData);
        rl.close();
        process.stderr.write("\n");
        resolve(password);
      } else if (ch === "\u0003") {
        // Ctrl+C
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener("data", onData);
        rl.close();
        process.stderr.write("\n");
        resolve(""); // treat as skip
      } else if (ch === "\u007f" || ch === "\b") {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stderr.write("\b \b");
        }
      } else {
        password += ch;
        process.stderr.write("•");
      }
    };

    process.stdin.on("data", onData);
    rl.on("close", () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeListener("data", onData);
      resolve(password);
    });
  });
}

/**
 * Remove a path using sudo, passing the password via stdin.
 * Returns bytes freed, or 0 on failure.
 * 
 * Security: password is passed via stdin to `sudo -S`, never as argument.
 */
export function sudoRmRf(targetPath: string, password: string): { freed: number; error?: string } {
  // Security fix (Gerard HIGH): only allow paths in the predefined privileged allowlist.
  // Prevents sudo rm -rf from being called on arbitrary absolute paths like /etc or /.
  if (!isPrivilegedPath(targetPath)) {
    return { freed: 0, error: `Refusing to sudo-remove non-privileged path: ${targetPath}` };
  }

  // Get size before removal
  const duResult = spawnSync("du", ["-sk", targetPath], { encoding: "utf8" });
  let sizeBefore = 0;
  if (duResult.stdout) {
    const kb = parseInt(duResult.stdout.split("\t")[0], 10);
    if (!isNaN(kb)) sizeBefore = kb * 1024;
  }

  // Run sudo rm -rf with password passed via stdin
  const result = spawnSync("sudo", ["-S", "rm", "-rf", targetPath], {
    input: password + "\n",
    encoding: "utf8",
    timeout: 30000,
  });

  if (result.status !== 0) {
    const stderr = result.stderr || "";
    if (stderr.includes("incorrect password") || stderr.includes("Sorry")) {
      return { freed: 0, error: "Incorrect sudo password" };
    }
    // Security fix (Gerard MEDIUM): strip any password prompt echo from stderr
    // before exposing it in the error string.
    const safeStderr = stderr.replace(/password[:\s]*/gi, "[password prompt]").trim();
    return { freed: 0, error: `sudo rm failed: ${safeStderr}` };
  }

  return { freed: sizeBefore };
}

/**
 * Verify a sudo password without doing any destructive action.
 * Returns true if the password is correct.
 */
export function verifySudoPassword(password: string): boolean {
  const result = spawnSync("sudo", ["-S", "-v"], {
    input: password + "\n",
    encoding: "utf8",
    timeout: 10000,
  });
  return result.status === 0;
}
