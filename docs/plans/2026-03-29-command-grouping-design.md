# Command Grouping by Utility Category

## Goal

Reorganize the flat list of 17 CLI commands into 5 logical groups (Cleanup, Protection, Speed, Applications, Files), inspired by CleanMyMac X's sidebar. Old flat commands remain as deprecated aliases.

## Architecture

Replace the single `clean` parent command with 5 category-level Commander subcommands. Each category becomes a top-level command (`mac-cleaner cleanup system`, `mac-cleaner speed maintain`). The existing `clean` command and top-level shorthands (`mac-cleaner system`) remain but print a deprecation warning pointing to the new grouped command. No changes to cleaner modules themselves -- only CLI routing, help output, and TUI presentation.

## Command Mapping

```
mac-cleaner cleanup <cmd>        # Disk space recovery
  system                         # System logs, temp files, caches
  brew                           # Homebrew cache & old versions
  node                           # npm/yarn/pnpm caches
  browser                        # Browser caches
  docker                         # Docker containers, images, volumes
  xcode                          # Xcode derived data & simulators
  cloud                          # Cloud storage caches
  mail                           # Mail attachments & downloads
  mobile-backups                 # iOS/iPadOS device backups
  all                            # Run all cleanup modules

mac-cleaner protection <cmd>     # Security & privacy
  privacy                        # Recent files, Finder recents
  keychain                       # Keychain entry audit (read-only)
  scan                           # Secrets scan

mac-cleaner speed <cmd>          # Performance & maintenance
  maintain                       # DNS flush, Spotlight rebuild, purge RAM, etc.
  startup                        # Launch Agents audit

mac-cleaner applications <cmd>   # App management
  apps                           # Leftover files from uninstalled apps

mac-cleaner files <cmd>          # File discovery & management
  large-files                    # Large & old files
  duplicates                     # Duplicate files
  disk-usage                     # Space Lens visual breakdown
```

## Backwards Compatibility

Old commands print a deprecation warning and still execute:

```
$ mac-cleaner system
[!] "system" is deprecated, use "cleanup system" instead
# ...runs normally...
```

Same for `mac-cleaner clean system` -> warns to use `mac-cleaner cleanup system`.

## Files to Change

| File | Change |
|---|---|
| `src/index.ts` | Replace `cleanCmd` with 5 group commands; add deprecated aliases |
| `src/utils/helpFormatter.ts` | Update command groups to reflect categories |
| `src/tui/scan.ts` | Add `group` field to `ModuleDef` |
| `src/tui/screens/cleaners.ts` | Render modules under group headers |
| `src/tui/widgets/menu.ts` | Update sidebar to show category groups |
| `README.md` | Update command documentation |

## What Does NOT Change

- Cleaner modules (`src/cleaners/*.ts`) -- zero changes
- Types (`src/types.ts`) -- no new types
- Utilities (`src/utils/`) -- no changes
- Individual cleaner tests -- they test `clean()` directly

## Decisions

- **Groups as top-level commands** (option A) over visual-only grouping
- **Maintain stays bundled** (option A) -- individual tasks too thin for own commands
- **Deprecated aliases with warnings** (option B) -- gives users migration time
