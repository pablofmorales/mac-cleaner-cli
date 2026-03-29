# Summary Table Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 4-column summary table (Module/Paths/Freed/Status) with a clean 3-column layout (Module/Paths/Freed) that fixes alignment and removes visual noise.

**Architecture:** Simplify `SummaryRow` by removing `status` and `warnings` fields. Rewrite `renderSummaryTable` for 3-column layout with dry-run indicated in the header. Update all 8 cleaner callers to use the simplified interface.

**Tech Stack:** TypeScript, chalk

---

### Task 1: Rewrite SummaryRow and renderSummaryTable

**Files:**
- Modify: `src/utils/format.ts:1-83`

**Step 1: Write the failing test**

Create `src/utils/format.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderSummaryTable, SummaryRow } from "./format.js";

describe("renderSummaryTable", () => {
  it("renders 3-column table without crashing", () => {
    const rows: SummaryRow[] = [
      { module: "system", paths: 136, freed: 4852000000 },
      { module: "brew", paths: 1, freed: 0 },
      { module: "browser", paths: 0, freed: 0 },
    ];

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));
    try {
      renderSummaryTable(rows);
    } finally {
      console.log = origLog;
    }

    const output = logs.join("\n");
    // Header has Module, Paths, Freed
    expect(output).toContain("Module");
    expect(output).toContain("Paths");
    expect(output).toContain("Freed");
    // No Status column
    expect(output).not.toContain("Status");
    // Total row present (multiple rows)
    expect(output).toContain("Total");
    // Zero paths shown as dash
    expect(output).toContain("\u2014");
  });

  it("shows (dry run) in header when dryRun is true", () => {
    const rows: SummaryRow[] = [
      { module: "system", paths: 10, freed: 1024 },
    ];

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));
    try {
      renderSummaryTable(rows, true);
    } finally {
      console.log = origLog;
    }

    const output = logs.join("\n");
    expect(output).toContain("dry run");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/format.test.ts`
Expected: FAIL — `SummaryRow` still requires `status` and `warnings`

**Step 3: Rewrite SummaryRow and renderSummaryTable**

Replace the `SummaryRow` interface and `renderSummaryTable` function in `src/utils/format.ts`:

```typescript
export interface SummaryRow {
  module: string;
  paths: number;
  freed: number;
}

/**
 * Renders a compact 3-column summary table.
 * Used by all cleaner modules and `clean all`.
 */
export function renderSummaryTable(rows: SummaryRow[], dryRun = false): void {
  const COL_MODULE = 14;
  const COL_PATHS = 8;
  const COL_FREED = 12;

  const freedLabel = dryRun ? "Freed (dry run)" : "Freed";
  const totalWidth = COL_MODULE + COL_PATHS + freedLabel.length + (12 - 5); // pad for longer label

  const header =
    chalk.bold("Module".padEnd(COL_MODULE)) +
    chalk.bold("Paths".padStart(COL_PATHS)) +
    chalk.bold(freedLabel.padStart(COL_FREED + (freedLabel.length - 5)));

  const divider = "\u2500".repeat(COL_MODULE + COL_PATHS + COL_FREED + (dryRun ? 10 : 0));

  console.log();
  console.log(header);
  console.log(chalk.gray(divider));

  let totalPaths = 0;
  let totalFreed = 0;

  for (const row of rows) {
    totalPaths += row.paths;
    totalFreed += row.freed;

    const pathsStr = row.paths > 0 ? String(row.paths) : chalk.gray("\u2014");
    const freedStr = row.freed > 0 ? formatBytes(row.freed) : chalk.gray("\u2014");

    console.log(
      row.module.padEnd(COL_MODULE) +
      pathsStr.padStart(COL_PATHS) +
      freedStr.padStart(COL_FREED)
    );
  }

  if (rows.length > 1) {
    console.log(chalk.gray(divider));
    const totalFreedStr = totalFreed > 0 ? formatBytes(totalFreed) : chalk.gray("\u2014");
    console.log(
      chalk.bold("Total".padEnd(COL_MODULE)) +
      chalk.bold(String(totalPaths).padStart(COL_PATHS)) +
      chalk.bold(totalFreedStr.padStart(COL_FREED))
    );
  }

  console.log();

  if (!dryRun) {
    console.log(chalk.gray("  Run with --verbose to see details of each path."));
  }
  console.log();
}
```

Also remove the now-unused `statusStr` helper function (lines 78-83).

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/format.ts src/utils/format.test.ts
git commit -m "refactor: simplify summary table to 3-column layout"
```

---

### Task 2: Update all cleaner callers — remove status and warnings

**Files:**
- Modify: `src/cleaners/brew.ts:59,103`
- Modify: `src/cleaners/node.ts:218,281`
- Modify: `src/cleaners/browser.ts:73,112`
- Modify: `src/cleaners/docker.ts:71,147`
- Modify: `src/cleaners/xcode.ts:96,129`
- Modify: `src/cleaners/privacy.ts:70,140`

**Step 1: Update each cleaner**

In every file, change the inline `renderSummaryTable` calls to remove `status` and `warnings`. The pattern is the same for all 6 files:

**Before** (example from brew.ts:59):
```typescript
renderSummaryTable([{ module: "Brew", paths: cleanedPaths.length, freed, status: "would_free", warnings: errors.length }], true);
```

**After:**
```typescript
renderSummaryTable([{ module: "Brew", paths: cleanedPaths.length, freed }], true);
```

**Before** (example from brew.ts:103):
```typescript
renderSummaryTable([{ module: "Brew", paths: cleanedPaths.length, freed, status: "freed", warnings: errors.length }]);
```

**After:**
```typescript
renderSummaryTable([{ module: "Brew", paths: cleanedPaths.length, freed }]);
```

Apply this same transformation to all 6 files (brew, node, browser, docker, xcode, privacy) — remove `, status: "...", warnings: ...` from every `SummaryRow` object literal.

**Step 2: Run full test suite**

Run: `npx vitest run --exclude '.worktrees/**'`
Expected: All tests pass (no test references `status` or `warnings` on `SummaryRow`)

**Step 3: Commit**

```bash
git add src/cleaners/brew.ts src/cleaners/node.ts src/cleaners/browser.ts src/cleaners/docker.ts src/cleaners/xcode.ts src/cleaners/privacy.ts
git commit -m "refactor: remove status/warnings from cleaner summary table calls"
```

---

### Task 3: Update system.ts and all.ts callers

**Files:**
- Modify: `src/cleaners/system.ts:164-173,269-280`
- Modify: `src/cleaners/all.ts:82-90`

These two files are separate because they construct `SummaryRow[]` variables (not inline), so the change is slightly different.

**Step 1: Update system.ts**

Dry-run rows (lines 164-173), change to:
```typescript
const rows: SummaryRow[] = [
  { module: "User caches", paths: cleanedPaths.length, freed },
  { module: "Privileged", paths: privilegedPaths.length, freed: privSize },
];
```

Actual cleanup rows (lines 269-280), change to:
```typescript
const rows: SummaryRow[] = [
  { module: "User caches", paths: cleanedPaths.filter((p) => !isPrivilegedPath(p)).length, freed: freed - privilegedFreed },
];
if (privilegedPaths.length > 0) {
  rows.push({
    module: "Privileged",
    paths: cleanedPaths.filter((p) => isPrivilegedPath(p)).length,
    freed: privilegedFreed,
  });
}
```

Also update the import line (line 9) to remove `SummaryRow` if no longer needed as a named import (it's still used for the type annotation, so keep it).

**Step 2: Update all.ts**

Lines 82-90, change to:
```typescript
const rows: SummaryRow[] = results.map(({ name, result }) => ({
  module: name,
  paths: result.paths.length,
  freed: result.freed,
}));
```

**Step 3: Run full test suite**

Run: `npx vitest run --exclude '.worktrees/**'`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/cleaners/system.ts src/cleaners/all.ts
git commit -m "refactor: remove status/warnings from system and all summary tables"
```

---

### Task 4: Build and smoke test

**Step 1: Build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Smoke test — single module**

Run: `npm run dev -- system --dry-run`
Expected: Clean 3-column table, no Status column, `(dry run)` in Freed header

**Step 3: Smoke test — all modules**

Run: `npm run dev -- all --dry-run`
Expected: 8-row table with all modules, Total row with divider, clean alignment

**Step 4: Smoke test — live run**

Run: `npm run dev -- system --no-sudo`
Expected: 3-column table, verbose hint at bottom, no Status column

**Step 5: Final commit (if any fixes needed)**

Only if smoke tests revealed issues.
