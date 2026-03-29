# Hide Sudo Password Input — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix password echo leak where typed characters are visible alongside masking bullets in the sudo password prompt.

**Architecture:** Remove the unused `readline` interface from `promptSudoPassword()` — it causes terminal echo that leaks characters. Replace with direct raw `process.stdin` handling only. Add a unit test for the masking behavior.

**Tech Stack:** Node.js raw stdin, Vitest, TypeScript

---

### Task 1: Write a failing test for password masking

**Files:**
- Create: `src/utils/sudo.test.ts`

**Step 1: Write the failing test**

The test verifies that `promptSudoPassword` does NOT echo typed characters — only `•` bullets should appear in stdout.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Readable, Writable } from "stream";

describe("promptSudoPassword", () => {
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;
  let stdoutChunks: string[];

  beforeEach(() => {
    stdoutChunks = [];
  });

  afterEach(() => {
    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });
    Object.defineProperty(process, "stdout", { value: originalStdout, writable: true });
  });

  it("masks password with bullets and never echoes raw characters", async () => {
    // Create a fake stdin that we can push data into
    const fakeStdin = new Readable({ read() {} }) as Readable & { isTTY: boolean; setRawMode: () => Readable };
    fakeStdin.isTTY = true;
    fakeStdin.setRawMode = vi.fn().mockReturnThis();
    Object.defineProperty(process, "stdin", { value: fakeStdin, writable: true });

    // Capture stdout writes
    const fakeStdout = new Writable({
      write(chunk, _encoding, callback) {
        stdoutChunks.push(chunk.toString());
        callback();
      },
    });
    Object.defineProperty(process, "stdout", { value: fakeStdout, writable: true });

    const { promptSudoPassword } = await import("./sudo.js");
    const promise = promptSudoPassword(["/tmp/test"]);

    // Simulate typing "abc" then Enter
    fakeStdin.push(Buffer.from("a"));
    fakeStdin.push(Buffer.from("b"));
    fakeStdin.push(Buffer.from("c"));
    fakeStdin.push(Buffer.from("\r"));

    const result = await promise;
    const allOutput = stdoutChunks.join("");

    // Password buffer should contain "abc"
    expect(result.toString()).toBe("abc");

    // Output should contain bullets but NOT the raw characters after the prompt
    // The prompt text will contain the letter "a" in words like "path" and "elevated",
    // but the masking area should only show "•••"
    expect(allOutput).toContain("•••");

    // The raw password characters should NOT appear as consecutive echoed chars
    // between or alongside the bullets
    expect(allOutput).not.toMatch(/a•|•a|b•|•b|c•|•c/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/sudo.test.ts`
Expected: FAIL — the current readline-based implementation echoes raw characters alongside bullets.

---

### Task 2: Fix `promptSudoPassword` to remove readline echo

**Files:**
- Modify: `src/utils/sudo.ts:1-77`

**Step 1: Replace the `promptSudoPassword` function**

Remove the `readline` import and the readline-based implementation. Use direct raw stdin handling:

```typescript
import { spawnSync } from "child_process";
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

    // Enable raw mode to suppress terminal echo — characters won't be
    // printed by the OS, only our explicit "•" bullets appear.
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    // Collect raw bytes — avoid building a string to keep the data in controlled memory
    const chunks: Buffer[] = [];

    const cleanup = () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
    };

    const onData = (char: Buffer) => {
      const ch = char.toString("utf8");

      if (ch === "\r" || ch === "\n") {
        // Enter pressed
        cleanup();
        process.stdout.write("\n");
        resolve(Buffer.concat(chunks));
      } else if (ch === "\u0003") {
        // Ctrl+C — treat as skip
        cleanup();
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
  });
}
```

Key changes:
1. Removed `import * as readline from "readline"` — no longer needed
2. Removed `readline.createInterface(...)` — this was causing the character echo
3. Added `process.stdin.resume()` — ensures stdin is flowing in raw mode
4. Added `process.stdin.pause()` in cleanup — restores stdin state after input
5. Removed the `rl.on("close")` handler — no longer needed without readline

**Step 2: Run test to verify it passes**

Run: `npx vitest run src/utils/sudo.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Build the project**

Run: `npm run build`
Expected: Clean build, no errors

**Step 5: Commit**

```bash
git add src/utils/sudo.ts src/utils/sudo.test.ts
git commit -m "fix(security): hide sudo password input by removing readline echo

readline.createInterface({ terminal: true }) was echoing typed characters
alongside the masking bullets, exposing the password in plain text.
Removed readline entirely — raw stdin with setRawMode(true) is sufficient
and properly suppresses all character echo."
```

---

### Task 3: Manual verification

**Step 1: Test interactively**

Run: `npm run dev -- system`
Expected: When prompted for sudo password, only `•` bullets appear — no raw characters visible.

**Step 2: Test skip behavior**

Run: `npm run dev -- system`
At the password prompt, press Enter to skip.
Expected: Prompt returns cleanly, no sudo operations attempted.

**Step 3: Test Ctrl+C behavior**

Run: `npm run dev -- system`
At the password prompt, press Ctrl+C.
Expected: Prompt returns cleanly, treats as skip.

**Step 4: Test backspace behavior**

Run: `npm run dev -- system`
At the password prompt, type a few characters, backspace, then Enter.
Expected: Bullets appear and disappear with backspace, no raw characters visible.
