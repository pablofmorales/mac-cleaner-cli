# Summary Table Redesign

## Goal
Replace the current 4-column summary table (Module, Paths, Freed, Status) with a clean 3-column layout (Module, Paths, Freed) that fixes alignment issues and removes visual noise.

## Current Problems
- Status column repeats the same icon/text for every row (visual clutter)
- Alignment breaks when freed values mix dashes and formatted bytes
- Table looks broken in some terminal widths

## Design

### Layout (live run)
```
  Module       Paths     Freed
  ─────────────────────────────
  system         136    4.52 GB
  brew             1         —
  node             2   34.36 MB
  browser          —         —
  docker           4    5.00 GB
  xcode            1         —
  keychain         —         —
  privacy          —         —
  ─────────────────────────────
  Total          144    9.56 GB
```

### Layout (dry run)
```
  Module       Paths     Freed (dry run)
  ──────────────────────────────────────
  system          23   244.00 KB
  ...
```

### Rules
- 3 columns: Module (left-aligned), Paths (right-aligned), Freed (right-aligned)
- Zero paths/freed shown as `—` (em dash)
- Dry-run appends `(dry run)` to the Freed header
- Total row with divider, only shown when multiple rows
- `--verbose` hint stays below table for non-dry-run mode

### Changes Required
- Rewrite `renderSummaryTable` in `src/utils/format.ts` — 3 columns, no status/warnings
- Simplify `SummaryRow` interface — remove `status` and `warnings` fields
- Update all callers (system, brew, node, browser, docker, xcode, keychain, privacy, all) to stop passing status/warnings
