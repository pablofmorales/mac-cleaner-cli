import { spawnSync } from "child_process";
import * as readline from "readline";
import { isPrivilegedPath } from "./privilegedPaths.js";

/**
 * Prompt the user for a sudo password using masked input.
 * Returns the entered password as a Buffer so the caller can zeroize it after use.
 * Returns an empty Buffer if user skips (presses Enter).
 *
 * Security (#39): using Buffer instead of string allows the caller to zeroize
 * the password immediately after use via buffer.fill(0), reducing the window
 * during which the password sits in V8's heap.
 *
 * Never stores or logs the password.
 */
export async function promptSudoPassword(paths: string[]): Promise<Buffer> {
  return new Promise((resolve) => {
    process.stdout.write(`\n  🔒 ${paths.length} path(s) require elevated privileges:\n`);
    for (const p of paths.slice(0, 5)) {
      process.stdout.write(`     ${p}\n`);
    }
    if (paths.length > 5) {
      process.stdout.write(`     ... and ${paths.length - 5} more\n`);
    }
    process.stdout.write("\n  Enter sudo password to include these (or press Enter to skip): ");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Hide input characters
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // Collect raw bytes — avoid building a string to keep the data in controlled memory
    const chunks: Buffer[] = [];

    const onData = (char: Buffer) => {
      const ch = char.toString("utf8");

      if (ch === "\r" || ch === "\n") {
        // Enter pressed
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.removeListener("data", onData);
        rl.close();
        process.stdout.write("\n");
        resolve(Buffer.concat(chunks));
      } else if (ch === "\u0003") {
        // Ctrl+C — treat as skip
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.removeListener("data", onData);
        rl.close();
        process.stdout.write("\n");
        resolve(Buffer.alloc(0));
      } else if (ch === "\u007f" || ch === "\b") {
        // Backspace
        if (chunks.length > 0) {
          chunks.pop();
          process.stdout.write("\b \b");
        }
      } else {
        chunks.push(Buffer.from(ch, "utf8"));
        process.stdout.write("•");
      }
    };

    process.stdin.on("data", onData);
    rl.on("close", () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onData);
      resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Remove a path using sudo, passing the password via stdin.
 * Returns bytes freed, or 0 on failure.
 *
 * Security (#39): accepts a Buffer instead of a string so the caller
 * can zeroize it via buffer.fill(0) immediately after all operations complete.
 * Password is passed via stdin to `sudo -S`, never as an argument.
 */
export function sudoRmRf(targetPath: string, passwordBuf: Buffer): { freed: number; error?: string } {
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

  // Run sudo rm -rf with password passed via stdin (Buffer + newline, never as arg)
  const stdinInput = Buffer.concat([passwordBuf, Buffer.from("\n")]);
  const result = spawnSync("sudo", ["-S", "rm", "-rf", targetPath], {
    input: stdinInput,
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
 * Accepts a Buffer so the caller can zeroize it after use.
 * Returns true if the password is correct.
 */
export function verifySudoPassword(passwordBuf: Buffer): boolean {
  const stdinInput = Buffer.concat([passwordBuf, Buffer.from("\n")]);
  const result = spawnSync("sudo", ["-S", "-v"], {
    input: stdinInput,
    timeout: 10000,
  });
  return result.status === 0;
}
