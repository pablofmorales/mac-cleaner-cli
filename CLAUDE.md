# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@blackasteroid/mac-cleaner-cli` is a macOS CLI tool (`mac-cleaner`) that frees disk space by cleaning caches, logs, and temp files from development tools. Published to npm, requires Node >= 20 and macOS.

## Commands

```bash
# Build (tsup, outputs ESM to dist/)
npm run build

# Run in development
npm run dev -- <command> [options]      # e.g. npm run dev -- system --dry-run

# Run all tests (vitest)
npm test

# Run a single test file
npx vitest run src/cleaners/system.test.ts

# Lint
npm run lint
```

## Architecture

**ES module project** (`"type": "module"` in package.json). Built with tsup, which adds the shebang and bundles `src/index.ts` → `dist/index.js`.

### CLI Layer (`src/index.ts`)
Uses Commander.js. Commands are registered both as top-level shortcuts (`mac-cleaner brew`) and grouped under `clean` (`mac-cleaner clean brew`). Common options (`--dry-run`, `--json`, `--verbose`, `--no-sudo`, `--yes`, `--secure-delete`) are added via `addCleanOptions()`.

### Cleaner Modules (`src/cleaners/`)
Each cleaner exports `clean(options: CleanOptions): Promise<CleanResult>`. All cleaners are independent and follow the same contract defined in `src/types.ts`. `all.ts` is the orchestrator that runs every cleaner sequentially and aggregates results.

Cleaners: `system`, `brew`, `node`, `browser`, `docker`, `xcode`, `keychain`, `privacy`, `secrets`.

### Utilities (`src/utils/`)
- **safeDelete.ts** — Symlink escape protection; all file deletions must go through `safeRmSync()`
- **sudo.ts** — Sudo password as Buffer, passed via stdin, never stored. Uses `privilegedPaths.ts` allowlist
- **du.ts** — Disk usage via `du -sk`, plus `formatBytes()`
- **spinner.ts** — ora spinner with text fallback for non-TTY/CI
- **auditLog.ts** — JSON-line log to `~/.mac-cleaner/audit.log` (mode 0o600)
- **version.ts** — npm registry version checks with 24h cache, strict semver validation
- **format.ts** — ASCII summary table rendering with chalk

## Key Patterns

- **Shell commands use `spawnSync` with explicit argument arrays** — never string concatenation. This is a security requirement.
- **Privileged path allowlist** (`privilegedPaths.ts`) — sudo deletion only works on paths in this allowlist.
- **Graceful degradation** — missing tools (brew, docker, xcrun) are detected and skipped, never crash.
- **Output modes** — default (colored table), `--verbose` (per-path), `--json` (machine-parseable), `--dry-run` (preview only).

## Testing

Tests are co-located (`src/cleaners/*.test.ts`). They validate dry-run correctness, JSON output shape, `CleanResult` contract, and graceful handling of missing tools. The `all.test.ts` orchestrator tests use 60s timeouts. No separate vitest config file — uses defaults.
