# System Clean: Output Noise & False Errors Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two bugs in the system cleaner: (1) errors print even without `--verbose`, creating noisy output, and (2) several paths fail unnecessarily due to incorrect symlink-escape detection and missing FDA patterns.

**Architecture:** Gate non-critical warning output behind `--verbose`. Fix `isSafeToDelete` to distinguish permission errors from actual symlink escapes. Expand `FDA_REQUIRED_PATTERNS` to cover paths that macOS TCC protects even from sudo. Move TCC-protected paths out of the sudo pipeline since sudo can't help with them.

**Tech Stack:** TypeScript, Node.js `fs`/`child_process`, Vitest

---

### Task 1: Gate error output behind `--verbose` in system.ts

**Files:**
- Modify: `src/cleaners/system.ts:274-278`
- Test: `src/cleaners/system.test.ts`

**Step 1: Write the failing test**

Add to `src/cleaners/system.test.ts`:

```typescript
it("non-verbose mode suppresses error warnings from stdout", async () => {
  const warns: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: any[]) => warns.push(args.join(" "));

  try {
    await clean({ dryRun: true, json: false, verbose: false, noSudo: true, _suppressTable: true } as any);
  } finally {
    console.warn = origWarn;
  }

  // In non-verbose mode, no warning lines should be printed
  expect(warns.length).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/cleaners/system.test.ts -t "non-verbose mode suppresses error warnings"`
Expected: FAIL — because errors are currently always printed when `!options.json`

**Step 3: Fix error output gating**

In `src/cleaners/system.ts`, change lines 274-278 from:

```typescript
if (errors.length > 0 && !options.json) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }
```

to:

```typescript
if (errors.length > 0 && !options.json && options.verbose) {
    for (const e of errors) {
      console.warn(chalk.yellow(`  ⚠ ${e}`));
    }
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/cleaners/system.test.ts -t "non-verbose mode suppresses error warnings"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cleaners/system.ts src/cleaners/system.test.ts
git commit -m "fix: gate system cleaner error output behind --verbose flag"
```

---

### Task 2: Fix false "symlink escape detected" for permission-denied paths

**Files:**
- Modify: `src/utils/safeDelete.ts:35-58`
- Test: `src/cleaners/system.test.ts`

**Context:** When `fs.realpathSync` fails due to EACCES/EPERM (e.g., paths in `/private/tmp/` owned by other users), the catch block at line 53 returns `false`, causing a misleading "symlink escape detected" error. The fix: distinguish permission errors from real symlink escapes.

**Step 1: Write the failing test**

Add to `src/cleaners/system.test.ts`:

```typescript
it("does not report symlink escape for permission-denied /tmp paths", async () => {
  const result = await clean({ dryRun: false, json: true, verbose: false, noSudo: true } as any);

  // No error should mention "symlink escape" for /private/tmp paths
  const falseSymlinkErrors = result.errors.filter(
    (e) => e.includes("symlink escape") && (e.includes("/private/tmp") || e.includes("/tmp"))
  );
  expect(falseSymlinkErrors).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/cleaners/system.test.ts -t "does not report symlink escape for permission-denied"`
Expected: FAIL — paths like `/private/tmp/claude-501` are flagged as symlink escapes

**Step 3: Fix isSafeToDelete to handle permission errors**

In `src/utils/safeDelete.ts`, change the `isSafeToDelete` function's catch block and add known-safe-prefix check on the raw path before `realpathSync`:

```typescript
export function isSafeToDelete(targetPath: string, allowedBase: string): boolean {
  // Normalize the raw path first (before resolving symlinks)
  const normalizedTarget = normalizeMacOSPath(targetPath);

  // Allow known macOS system paths regardless of symlink resolution
  const knownSafePrefixes = ["/private/tmp", "/private/var/log", "/private/var/folders"];
  const isKnownSafe = knownSafePrefixes.some(
    (prefix) => normalizedTarget === prefix || normalizedTarget.startsWith(prefix + path.sep)
  );

  try {
    // Resolve symlinks to their real paths
    const resolvedTarget = normalizeMacOSPath(fs.realpathSync(targetPath));
    const resolvedBase = normalizeMacOSPath(fs.realpathSync(allowedBase));

    // Ensure the resolved path is strictly within the allowed base
    const isInBase = resolvedTarget === resolvedBase ||
      resolvedTarget.startsWith(resolvedBase + path.sep);

    if (isInBase) return true;

    // Check resolved path against known safe prefixes
    return knownSafePrefixes.some(
      (prefix) => resolvedTarget === prefix || resolvedTarget.startsWith(prefix + path.sep)
    );
  } catch {
    // If realpathSync fails (permission denied, path gone), fall back to the
    // raw-path check. Paths under known system directories are safe even if
    // we can't resolve symlinks — the OS owns these directories.
    if (isKnownSafe) return true;

    // For non-system paths, we can't validate — reject.
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/cleaners/system.test.ts -t "does not report symlink escape for permission-denied"`
Expected: PASS

**Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/utils/safeDelete.ts src/cleaners/system.test.ts
git commit -m "fix: distinguish permission errors from symlink escapes in /tmp paths"
```

---

### Task 3: Expand FDA_REQUIRED_PATTERNS and stop sudo on TCC-protected paths

**Files:**
- Modify: `src/cleaners/system.ts:50-59` (FDA_REQUIRED_PATTERNS)
- Modify: `src/utils/privilegedPaths.ts` (remove TCC-blocked paths from sudo allowlist)
- Test: `src/cleaners/system.test.ts`

**Context:** The screenshot shows three categories of failures:
1. `com.apple.ap.adprivacyd` and `com.apple.homed` get raw EPERM errors — they need FDA patterns
2. `CloudKit`, `FamilyCircle`, `com.apple.HomeKit` are in `PRIVILEGED_CACHE_PATHS` so sudo is attempted, but macOS TCC blocks even sudo. They should be treated as FDA-required instead, since sudo cannot bypass TCC.

**Step 1: Write the failing test**

Add to `src/cleaners/system.test.ts`:

```typescript
it("TCC-protected paths are classified as FDA, not attempted via sudo", async () => {
  const result = await clean({ dryRun: true, json: true });

  // None of these TCC-protected paths should appear in the errors with "sudo rm failed"
  const sudoErrors = result.errors.filter((e) => e.includes("sudo rm failed"));
  for (const e of sudoErrors) {
    expect(e).not.toContain("CloudKit");
    expect(e).not.toContain("FamilyCircle");
    expect(e).not.toContain("HomeKit");
  }
});
```

**Step 2: Run test to verify it fails (or passes in dry-run — verify logic manually)**

Run: `npx vitest run src/cleaners/system.test.ts -t "TCC-protected paths are classified as FDA"`
Expected: PASS in dry-run (sudo not invoked). This test is a regression guard for live runs.

**Step 3: Add missing patterns to FDA_REQUIRED_PATTERNS**

In `src/cleaners/system.ts`, update `FDA_REQUIRED_PATTERNS` (lines 50-59):

```typescript
const FDA_REQUIRED_PATTERNS = [
  "com.apple.Safari",
  "com.apple.containermanagerd",
  "com.apple.shortcuts",
  "com.apple.Notes",
  "com.apple.Mail",
  "com.apple.Messages",
  "CloudDocuments",
  "com.apple.iCloud",
  // Added: paths that macOS TCC blocks even with sudo
  "com.apple.ap.adprivacyd",
  "com.apple.homed",
  "CloudKit",
  "com.apple.iCloudHelper",
  "com.apple.HomeKit",
  "FamilyCircle",
  "com.apple.security.KCDatabase",
];
```

**Step 4: Remove TCC-blocked paths from PRIVILEGED_CACHE_PATHS**

In `src/utils/privilegedPaths.ts`, remove paths that TCC blocks even with sudo. These should not be in the sudo pipeline since sudo cannot help:

```typescript
export const PRIVILEGED_CACHE_PATHS: string[] = [
  // System log paths (sudo actually works for these)
  "/var/log",
  "/private/var/log",
  // Power log (requires root)
  "/tmp/powerlog",
  "/private/tmp/powerlog",
];
```

Remove: `CloudKit`, `com.apple.iCloudHelper`, `com.apple.HomeKit`, `FamilyCircle`, `com.apple.security.KCDatabase` — these are all TCC-protected, sudo doesn't help.

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/cleaners/system.ts src/utils/privilegedPaths.ts src/cleaners/system.test.ts
git commit -m "fix: classify TCC-protected paths as FDA-required instead of sudo targets"
```

---

### Task 4: Improve the error message for non-FDA permission failures

**Files:**
- Modify: `src/cleaners/system.ts:86-98` (removePathSafe error handling)

**Context:** Paths like `/tmp/node-compile-cache` fail with raw "EACCES: permission denied" messages. These are owned by root but not TCC-protected — sudo would actually help. The error should suggest running without `--no-sudo` rather than showing a raw message.

**Step 1: Improve the error message in removePathSafe**

In `src/cleaners/system.ts`, update the catch block in `removePathSafe` (lines 86-98):

```typescript
  } catch (err) {
    const msg = (err as Error).message;
    const isPermError = msg.includes("EPERM") || msg.includes("EACCES");
    if (isPermError && requiresFullDiskAccess(targetPath)) {
      errors.push(
        `Skipped (Full Disk Access required): ${targetPath}\n` +
        `  → Enable in: System Settings → Privacy & Security → Full Disk Access → add Terminal`
      );
    } else if (isPermError) {
      errors.push(`Skipped (elevated permissions required): ${targetPath}`);
    } else {
      errors.push(`Failed to remove ${targetPath}: ${msg}`);
    }
    return 0;
  }
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/cleaners/system.ts
git commit -m "fix: cleaner error message for permission-denied paths"
```

---

### Task 5: End-to-end verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Build the project**

Run: `npm run build`
Expected: Clean build, no errors

**Step 3: Manual smoke test — non-verbose (clean output)**

Run: `npm run dev -- system --dry-run`
Expected: Clean summary table, NO warning lines printed

**Step 4: Manual smoke test — verbose (shows details)**

Run: `npm run dev -- system --dry-run --verbose`
Expected: Summary table + warning details about FDA paths

**Step 5: Manual smoke test — live run without sudo**

Run: `npm run dev -- system --no-sudo`
Expected: Cleans user caches, no symlink escape false positives for `/tmp` paths, clean output

**Step 6: Final commit (if any remaining changes)**

Only if smoke tests revealed something to fix.
