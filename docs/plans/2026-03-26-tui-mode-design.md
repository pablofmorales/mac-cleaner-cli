# TUI Mode Design

**Issue:** #93 -- Interactive TUI mode
**Date:** 2026-03-26
**Branch:** `beta/tui-mode`

## Layout

Fixed-position panels using neo-blessed. No dynamic resizing or panel focus cycling.

```
+-- MAC-CLEANER v1.x --------------------------------------------------------+
|                                                                              |
|  +-- MENU (left) ------+  +-- MAIN AREA (center) -----------------------+  |
|  |                      |  |                                              |  |
|  |  [1] Dashboard       |  |  Content swaps based on active screen        |  |
|  |  [2] Cleaners        |  |  - Dashboard: storage, reclaimable space     |  |
|  |  [3] Settings        |  |  - Cleaners: checkbox list, run actions      |  |
|  |                      |  |  - Settings: theme, icons, sudo prefs        |  |
|  |  Quick Actions:      |  |                                              |  |
|  |  F1 Deep Scan        |  |                                              |  |
|  |  F2 Quick Clean      |  |                                              |  |
|  |  F5 Refresh          |  |                                              |  |
|  +----------------------+  +----------------------------------------------+  |
|                                                                              |
|  +-- LOG / PROGRESS -------------------------------------------------------+ |
|  |  14:05:01 [INFO]  Scan complete. 7 modules ready.                       | |
|  |  14:05:02 [SCAN]  ~/Library/Caches -- 2.1 GB reclaimable               | |
|  +-------------------------------------------------------------------------+ |
|                                                                              |
+-- q Quit  Tab Focus  Space Toggle -------------- F1 Scan  F2 Clean  ? Help -+
```

### Regions

| Region | Position | Behavior |
|--------|----------|----------|
| Menu | Fixed left column (~24 chars wide) | Screen navigation (1/2/3), quick actions (F-keys) |
| Main area | Fixed center, fills remaining width | Content swaps per screen |
| Log panel | Fixed bottom (~6 rows) | Scrollable, ring buffer (500 lines), live progress |
| Status bar | Bottom row | Left: key hints. Right: special actions |

## Screens

### 1. Dashboard
- Disk name, usage %, gradient bar (green/yellow/red)
- Purgeable + free space
- Reclaimable space per module (list with size bars)
- Total reclaimable summary

### 2. Cleaners
- Checkbox list of all cleaner modules with sizes
- Space to toggle, A to select all, Enter to run
- Preview panel showing paths for selected module
- Progress feedback during cleaning

### 3. Settings
- Icon set toggle (unicode / nerd)
- Theme selection (default / minimal / catppuccin)
- Sudo preference
- Dry-run default toggle

## Library

**neo-blessed** -- maintained fork of blessed, same API, works with modern Node.
**blessed-contrib** -- sparklines, gauges (used sparingly).
**chalk** -- already in project, used for color theming.

## Architecture

```
src/tui/
  index.ts          -- Entry point: screen setup, hotkeys, region layout
  screens/
    dashboard.ts    -- Dashboard screen content
    cleaners.ts     -- Cleaners screen with checkbox list
    settings.ts     -- Settings screen
  widgets/
    storage-bar.ts  -- Gradient progress bar
    log-panel.ts    -- Scrollable log with color-coded tags
    checkbox-list.ts -- Multi-select list
    menu.ts         -- Left sidebar menu
    status-bar.ts   -- Bottom status bar
  icons.ts          -- Icon registry (unicode/nerd)
  theme.ts          -- Theme definitions and color resolver
  detect.ts         -- Terminal capability detection

src/tui/scan.ts     -- Runs all cleaners in scan-only mode, returns sizes
```

## Integration

- `mac-cleaner` (no args) or `mac-cleaner menu` launches TUI
- Non-TTY detection: print help and exit
- Minimum terminal size: 80x24
- TUI reuses existing cleaner modules via their `clean()` exports
- Log panel subscribes to cleaner progress via callback

## Icon System

Dual icon set, no emojis:
- **unicode** (default): works everywhere
- **nerd**: opt-in via settings screen or `MAC_CLEANER_ICONS=nerd`

## Theme System

Three built-in themes:
- **default**: green on dark
- **minimal**: monochrome
- **catppuccin**: pastel

## Hotkeys

| Key | Action |
|-----|--------|
| 1 2 3 | Switch screens |
| F1 | Deep scan |
| F2 | Quick clean |
| F5 | Refresh |
| Space | Toggle checkbox |
| a | Select/deselect all |
| Enter | Run selected action |
| q / Esc | Quit |
| ? | Help overlay |
| d | Toggle dry-run |
