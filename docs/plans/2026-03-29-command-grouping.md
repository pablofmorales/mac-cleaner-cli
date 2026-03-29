# Command Grouping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize flat CLI commands into 5 utility groups (cleanup, protection, speed, applications, files) with deprecated aliases for backwards compatibility.

**Tracking:** https://github.com/BlackAsteroid/mac-cleaner-cli/issues/116

**Architecture:** Replace the single `clean` parent command in Commander with 5 group-level subcommands. Old flat commands and `clean <cmd>` remain as deprecated wrappers. TUI cleaners screen gets group headers. Help formatter reflects new categories.

**Tech Stack:** Commander.js, chalk, neo-blessed (TUI), vitest

---

### Task 1: Add deprecation warning utility

**Files:**
- Create: `src/utils/deprecation.ts`
- Test: `src/utils/deprecation.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { emitDeprecation } from "./deprecation.js";

describe("emitDeprecation", () => {
  it("prints a warning to stderr with old and new command", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    emitDeprecation("system", "cleanup system");
    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("system");
    expect(output).toContain("cleanup system");
    spy.mockRestore();
  });

  it("does not print when MAC_CLEANER_NO_DEPRECATION is set", () => {
    process.env.MAC_CLEANER_NO_DEPRECATION = "1";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    emitDeprecation("system", "cleanup system");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    delete process.env.MAC_CLEANER_NO_DEPRECATION;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/deprecation.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
import chalk from "chalk";

export function emitDeprecation(oldCmd: string, newCmd: string): void {
  if (process.env.MAC_CLEANER_NO_DEPRECATION) return;
  process.stderr.write(
    chalk.yellow(`[!] "${oldCmd}" is deprecated, use "${newCmd}" instead\n`),
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/deprecation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/deprecation.ts src/utils/deprecation.test.ts
git commit -m "feat: add deprecation warning utility"
```

---

### Task 2: Define the command group mapping

**Files:**
- Create: `src/commandGroups.ts`
- Test: `src/commandGroups.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { COMMAND_GROUPS, getGroupForCommand } from "./commandGroups.js";

describe("commandGroups", () => {
  it("has 5 groups", () => {
    expect(Object.keys(COMMAND_GROUPS)).toHaveLength(5);
  });

  it("maps system to cleanup", () => {
    expect(getGroupForCommand("system")).toBe("cleanup");
  });

  it("maps privacy to protection", () => {
    expect(getGroupForCommand("privacy")).toBe("protection");
  });

  it("maps maintain to speed", () => {
    expect(getGroupForCommand("maintain")).toBe("speed");
  });

  it("maps apps to applications", () => {
    expect(getGroupForCommand("apps")).toBe("applications");
  });

  it("maps large-files to files", () => {
    expect(getGroupForCommand("large-files")).toBe("files");
  });

  it("returns undefined for unknown commands", () => {
    expect(getGroupForCommand("nonexistent")).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/commandGroups.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
export interface CommandGroupDef {
  description: string;
  commands: string[];
}

export const COMMAND_GROUPS: Record<string, CommandGroupDef> = {
  cleanup: {
    description: "Clean caches, logs, and junk files to free disk space",
    commands: ["system", "brew", "node", "browser", "docker", "xcode", "cloud", "mail", "mobile-backups", "all"],
  },
  protection: {
    description: "Security audits and privacy cleanup",
    commands: ["privacy", "keychain", "scan"],
  },
  speed: {
    description: "Performance tuning and system maintenance",
    commands: ["maintain", "startup"],
  },
  applications: {
    description: "Manage leftover files from uninstalled apps",
    commands: ["apps"],
  },
  files: {
    description: "Find, analyze, and clean up files",
    commands: ["large-files", "duplicates", "disk-usage"],
  },
};

export function getGroupForCommand(cmd: string): string | undefined {
  for (const [group, def] of Object.entries(COMMAND_GROUPS)) {
    if (def.commands.includes(cmd)) return group;
  }
  return undefined;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/commandGroups.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commandGroups.ts src/commandGroups.test.ts
git commit -m "feat: define command group mapping"
```

---

### Task 3: Refactor `src/index.ts` -- add group commands

This is the largest task. Replace the `cleanCmd` parent with 5 group commands. Each group registers its cleaners as subcommands.

**Files:**
- Modify: `src/index.ts`

**Step 1: Replace the `clean` command group with 5 category groups**

Remove the `cleanCmd` block (lines 46-259) and the top-level shorthands (lines 261-453). Replace with group commands built from `COMMAND_GROUPS`, plus deprecated aliases.

The new structure in `src/index.ts` should be:

```typescript
import { COMMAND_GROUPS, getGroupForCommand } from "./commandGroups.js";
import { emitDeprecation } from "./utils/deprecation.js";

// ─── Helper: register a cleaner command on a parent ────────────────────────

function registerCleaner(
  parent: Command,
  name: string,
  description: string,
  importPath: string,
  extraOptions?: (cmd: Command) => Command,
): void {
  let cmd = parent.command(name).description(description);
  cmd = addCleanOptions(cmd);
  if (extraOptions) cmd = extraOptions(cmd);
  cmd.action(async (opts: Record<string, any>) => {
    const { clean } = await import(importPath);
    const result = await clean(opts as CleanOptions);
    outputResult(result, opts.json);
    process.exit(result.ok ? 0 : 1);
  });
}

// ─── Cleaner definitions (single source of truth) ──────────────────────────

interface CleanerDef {
  name: string;
  description: string;
  importPath: string;
  extraOptions?: (cmd: Command) => Command;
  /** Custom action override (for scan, disk-usage, etc.) */
  customAction?: (parent: Command) => void;
}

const CLEANERS: Record<string, CleanerDef> = {
  system:          { name: "system",          description: "Clean ~/Library/Caches, /tmp, and system logs",                      importPath: "./cleaners/system.js" },
  brew:            { name: "brew",            description: "Run brew cleanup and autoremove",                                     importPath: "./cleaners/brew.js" },
  node:            { name: "node",            description: "Clean npm/yarn/pnpm caches and orphan node_modules",                  importPath: "./cleaners/node.js",
    extraOptions: (cmd) => cmd.option("--include-orphans", "Also delete orphan node_modules (use carefully in monorepos)", false),
  },
  browser:         { name: "browser",         description: "Clean Chrome, Firefox, Safari, Arc, and Brave caches",                importPath: "./cleaners/browser.js" },
  docker:          { name: "docker",          description: "Prune Docker containers, images, volumes, and build cache",           importPath: "./cleaners/docker.js" },
  xcode:           { name: "xcode",           description: "Clean Xcode DerivedData, device support files, and simulators",       importPath: "./cleaners/xcode.js" },
  cloud:           { name: "cloud",           description: "Clean iCloud, Dropbox, Google Drive, and OneDrive cache directories", importPath: "./cleaners/cloud.js" },
  mail:            { name: "mail",            description: "Clean cached mail attachments and downloads from Apple Mail",          importPath: "./cleaners/mail.js" },
  "mobile-backups": { name: "mobile-backups", description: "Clean old iOS/iPadOS device backups",                                  importPath: "./cleaners/mobile.js" },
  all:             { name: "all",             description: "Run all cleaners in sequence with space recovery summary",            importPath: "./cleaners/all.js" },
  privacy:         { name: "privacy",         description: "Remove recent files lists, Finder recents, and XDG recent files",     importPath: "./cleaners/privacy.js" },
  keychain:        { name: "keychain",        description: "Audit macOS keychain entries (read-only -- nothing deleted)",           importPath: "./cleaners/keychain.js" },
  maintain:        { name: "maintain",        description: "Run macOS maintenance tasks (DNS flush, Spotlight rebuild, disk permissions, etc.)", importPath: "./cleaners/maintain.js" },
  startup:         { name: "startup",         description: "List and inspect Launch Agents and startup items (read-only audit)",   importPath: "./cleaners/startup.js" },
  apps:            { name: "apps",            description: "Find and remove leftover files from uninstalled applications",        importPath: "./cleaners/apps.js" },
  "large-files":   { name: "large-files",     description: "Find and remove large files (>100MB) not accessed recently",          importPath: "./cleaners/largefiles.js",
    extraOptions: (cmd) => cmd
      .option("--min-size <size>", "Minimum file size threshold (e.g. 100M, 1G)", "100M")
      .option("--older-than <days>", "Only include files not accessed in this many days", "90"),
  },
  duplicates:      { name: "duplicates",      description: "Find and remove duplicate files in ~/Downloads, ~/Documents, ~/Desktop", importPath: "./cleaners/duplicates.js",
    extraOptions: (cmd) => cmd.option("--min-size <size>", "Minimum file size to consider (e.g. 1M, 500K)", "1M"),
  },
};

// ─── Register group commands ───────────────────────────────────────────────

for (const [groupName, groupDef] of Object.entries(COMMAND_GROUPS)) {
  const groupCmd = program.command(groupName).description(groupDef.description);

  for (const cmdName of groupDef.commands) {
    // scan and disk-usage have custom action signatures, handle separately
    if (cmdName === "scan") {
      /* registered separately below */
      continue;
    }
    if (cmdName === "disk-usage") {
      /* registered separately below */
      continue;
    }

    const def = CLEANERS[cmdName];
    if (!def) continue;

    registerCleaner(groupCmd, def.name, def.description, def.importPath, def.extraOptions);
  }
}
```

**Step 2: Register scan under the protection group**

`scan` has a non-standard action (uses `scan()` not `clean()`) -- register it with a custom action on the `protection` group:

```typescript
const protectionCmd = program.commands.find((c) => c.name() === "protection")!;

protectionCmd
  .command("scan")
  .description("Scan caches and config files for accidentally exposed secrets (does not delete)")
  .option("--json", "Output results as JSON", false)
  .option("-v, --verbose", "Show redacted previews of each finding", false)
  .action(async (opts: { json: boolean; verbose: boolean }) => {
    const { scan } = await import("./cleaners/secrets.js");
    const result = await scan(opts);
    if (opts.json) {
      console.log(JSON.stringify({ ok: result.ok, data: { findings: result.findings, scannedFiles: result.scannedFiles }, error: result.errors.length ? result.errors : null }));
    }
    process.exit(result.findings.length > 0 ? 1 : 0);
  });
```

**Step 3: Register disk-usage under the files group**

`disk-usage` is also non-standard (uses `runDiskUsage` not `clean`):

```typescript
const filesCmd = program.commands.find((c) => c.name() === "files")!;

filesCmd
  .command("disk-usage")
  .description("Show visual breakdown of disk usage by directory (Space Lens)")
  .argument("[path]", "Directory to scan (default: home directory)")
  .option("--json", "Output results as JSON", false)
  .action(async (pathArg: string | undefined, opts: { json: boolean }) => {
    const { runDiskUsage } = await import("./commands/diskusage.js");
    await runDiskUsage({ json: opts.json, path: pathArg });
  });
```

**Step 4: Add deprecated top-level aliases**

For every command that was previously a top-level shorthand, register a hidden deprecated alias:

```typescript
// ─── Deprecated aliases ────────────────────────────────────────────────────

for (const [cmdName, def] of Object.entries(CLEANERS)) {
  const group = getGroupForCommand(cmdName);
  if (!group) continue;

  let cmd = program.command(cmdName).description(def.description).hideHelp();
  cmd = addCleanOptions(cmd);
  if (def.extraOptions) cmd = def.extraOptions(cmd);
  cmd.action(async (opts: Record<string, any>) => {
    emitDeprecation(cmdName, `${group} ${cmdName}`);
    const { clean } = await import(def.importPath);
    const result = await clean(opts as CleanOptions);
    outputResult(result, opts.json);
    process.exit(result.ok ? 0 : 1);
  });
}

// Deprecated `clean` parent command
const cleanCmd = program.command("clean").description("Clean specific cache categories").hideHelp();
for (const [cmdName, def] of Object.entries(CLEANERS)) {
  const group = getGroupForCommand(cmdName);
  if (!group) continue;

  let cmd = cleanCmd.command(cmdName).description(def.description);
  cmd = addCleanOptions(cmd);
  if (def.extraOptions) cmd = def.extraOptions(cmd);
  cmd.action(async (opts: Record<string, any>) => {
    emitDeprecation(`clean ${cmdName}`, `${group} ${cmdName}`);
    const { clean } = await import(def.importPath);
    const result = await clean(opts as CleanOptions);
    outputResult(result, opts.json);
    process.exit(result.ok ? 0 : 1);
  });
}

// Deprecated top-level scan
program.command("scan").hideHelp()
  .description("Scan for secrets")
  .option("--json", "", false)
  .option("-v, --verbose", "", false)
  .action(async (opts: { json: boolean; verbose: boolean }) => {
    emitDeprecation("scan", "protection scan");
    const { scan } = await import("./cleaners/secrets.js");
    const result = await scan(opts);
    if (opts.json) {
      console.log(JSON.stringify({ ok: result.ok, data: { findings: result.findings, scannedFiles: result.scannedFiles }, error: result.errors.length ? result.errors : null }));
    }
    process.exit(result.findings.length > 0 ? 1 : 0);
  });

// Deprecated top-level disk-usage
program.command("disk-usage").hideHelp()
  .description("Space Lens")
  .argument("[path]", "")
  .option("--json", "", false)
  .action(async (pathArg: string | undefined, opts: { json: boolean }) => {
    emitDeprecation("disk-usage", "files disk-usage");
    const { runDiskUsage } = await import("./commands/diskusage.js");
    await runDiskUsage({ json: opts.json, path: pathArg });
  });
```

**Step 5: Keep standalone commands as-is**

`upgrade`, `status`, and `menu` are not part of any cleaner group -- they stay as top-level commands unchanged.

**Step 6: Verify the build compiles**

Run: `npm run build`
Expected: PASS

**Step 7: Smoke test**

Run: `npm run dev -- cleanup system --dry-run`
Expected: Runs system cleaner in dry-run mode

Run: `npm run dev -- system --dry-run`
Expected: Prints deprecation warning, then runs system cleaner

**Step 8: Commit**

```bash
git add src/index.ts
git commit -m "feat: reorganize CLI commands into utility groups"
```

---

### Task 4: Update help formatter

**Files:**
- Modify: `src/utils/helpFormatter.ts`

**Step 1: Update the COMMANDS object to reflect new groups**

Replace the existing `COMMANDS` constant (lines 6-25) with:

```typescript
const COMMANDS = {
  CLEANUP: [
    { name: "all",             desc: "Clean everything at once (safe defaults)" },
    { name: "system",          desc: "Remove system logs, temp files & caches" },
    { name: "brew",            desc: "Clear Homebrew cache & old package versions" },
    { name: "node",            desc: "Wipe node_modules caches & npm/yarn/pnpm stores" },
    { name: "browser",         desc: "Remove browser caches (Chrome, Safari, Firefox, Arc)" },
    { name: "docker",          desc: "Delete unused images, containers & volumes" },
    { name: "xcode",           desc: "Clear Xcode derived data & simulator caches" },
    { name: "cloud",           desc: "Clean cloud storage caches" },
    { name: "mail",            desc: "Clean cached mail attachments & downloads" },
    { name: "mobile-backups",  desc: "Clean old iOS/iPadOS device backups" },
  ],
  PROTECTION: [
    { name: "privacy",         desc: "Clear app usage history & recent files" },
    { name: "keychain",        desc: "Audit stale Keychain entries (read-only)" },
    { name: "scan",            desc: "Scan caches for accidentally exposed secrets" },
  ],
  SPEED: [
    { name: "maintain",        desc: "DNS flush, Spotlight rebuild, purge RAM, etc." },
    { name: "startup",         desc: "List & inspect Launch Agents (read-only)" },
  ],
  APPLICATIONS: [
    { name: "apps",            desc: "Find & remove leftover files from uninstalled apps" },
  ],
  FILES: [
    { name: "large-files",     desc: "Find and remove large & old files" },
    { name: "duplicates",      desc: "Find and remove duplicate files" },
    { name: "disk-usage",      desc: "Show visual disk usage breakdown (Space Lens)" },
  ],
  OTHER: [
    { name: "upgrade",         desc: "Update mac-cleaner to the latest version" },
    { name: "status",          desc: "Show system health overview" },
    { name: "menu",            desc: "Launch interactive TUI dashboard" },
    { name: "help [command]",  desc: "Show help for a specific command" },
  ],
};
```

**Step 2: Update the renderCommandGroup calls**

Replace the 3 `renderCommandGroup` calls (lines 83-85) with:

```typescript
lines.push(renderCommandGroup("CLEANUP", COMMANDS.CLEANUP));
lines.push(renderCommandGroup("PROTECTION", COMMANDS.PROTECTION));
lines.push(renderCommandGroup("SPEED", COMMANDS.SPEED));
lines.push(renderCommandGroup("APPLICATIONS", COMMANDS.APPLICATIONS));
lines.push(renderCommandGroup("FILES", COMMANDS.FILES));
lines.push(renderCommandGroup("OTHER", COMMANDS.OTHER));
```

**Step 3: Update USAGE line**

Change usage from `<command>` to `<group> <command>`:

```typescript
lines.push(`  mac-cleaner ${chalk.bold.cyan("<group> <command>")} ${chalk.gray("[options]")}`);
```

**Step 4: Update EXAMPLES**

```typescript
const EXAMPLES = [
  { cmd: "mac-cleaner cleanup all --dry-run",       comment: "# Preview full cleanup" },
  { cmd: "mac-cleaner cleanup node --verbose",      comment: "# Clean node with details" },
  { cmd: "mac-cleaner cleanup brew",                comment: "# Quick Homebrew cleanup" },
  { cmd: "mac-cleaner protection scan",             comment: "# Check for leaked secrets" },
  { cmd: "mac-cleaner speed maintain",              comment: "# DNS flush, Spotlight, etc." },
  { cmd: "mac-cleaner files disk-usage",            comment: "# Visual Space Lens" },
  { cmd: "mac-cleaner cleanup all --json | jq .",   comment: "# JSON output for scripting" },
  { cmd: "mac-cleaner upgrade",                     comment: "# Update to latest version" },
];
```

**Step 5: Verify help output**

Run: `npm run dev -- --help`
Expected: Shows grouped commands under CLEANUP, PROTECTION, SPEED, APPLICATIONS, FILES, OTHER

**Step 6: Commit**

```bash
git add src/utils/helpFormatter.ts
git commit -m "feat: update help formatter with grouped command layout"
```

---

### Task 5: Add group field to TUI scan module list

**Files:**
- Modify: `src/tui/scan.ts`

**Step 1: Add group field to ModuleDef**

At `src/tui/scan.ts:105-109`, update the interface:

```typescript
interface ModuleDef {
  name: string;
  key: string;
  importPath: string;
  group: string;
}
```

**Step 2: Add group to each module entry**

Update the `modules` array (lines 111-128) to include group:

```typescript
const modules: ModuleDef[] = [
  { name: "System",      key: "system",     importPath: "../cleaners/system.js",     group: "cleanup" },
  { name: "Brew",        key: "brew",       importPath: "../cleaners/brew.js",       group: "cleanup" },
  { name: "Node",        key: "node",       importPath: "../cleaners/node.js",       group: "cleanup" },
  { name: "Browser",     key: "browser",    importPath: "../cleaners/browser.js",    group: "cleanup" },
  { name: "Docker",      key: "docker",     importPath: "../cleaners/docker.js",     group: "cleanup" },
  { name: "Xcode",       key: "xcode",      importPath: "../cleaners/xcode.js",      group: "cleanup" },
  { name: "Cloud",       key: "cloud",      importPath: "../cleaners/cloud.js",      group: "cleanup" },
  { name: "Mail",        key: "mail",       importPath: "../cleaners/mail.js",       group: "cleanup" },
  { name: "iOS Backups", key: "mobile",     importPath: "../cleaners/mobile.js",     group: "cleanup" },
  { name: "Privacy",     key: "privacy",    importPath: "../cleaners/privacy.js",    group: "protection" },
  { name: "Keychain",    key: "keychain",   importPath: "../cleaners/keychain.js",   group: "protection" },
  { name: "Maintain",    key: "maintain",   importPath: "../cleaners/maintain.js",   group: "speed" },
  { name: "Startup",     key: "startup",    importPath: "../cleaners/startup.js",    group: "speed" },
  { name: "Apps",        key: "apps",       importPath: "../cleaners/apps.js",       group: "applications" },
  { name: "Large Files", key: "largefiles", importPath: "../cleaners/largefiles.js", group: "files" },
  { name: "Duplicates",  key: "duplicates", importPath: "../cleaners/duplicates.js", group: "files" },
];
```

**Step 3: Verify build**

Run: `npm run build`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add src/tui/scan.ts
git commit -m "feat: add group field to TUI module definitions"
```

---

### Task 6: Update TUI cleaners screen with group headers

**Files:**
- Modify: `src/tui/screens/cleaners.ts`

**Step 1: Import getModuleList and group items**

Update the `renderList` function to insert group header lines between modules of different groups.

In `src/tui/screens/cleaners.ts`, modify the `items` creation and `renderList`:

```typescript
// After line 7, import the group labels
const GROUP_LABELS: Record<string, string> = {
  cleanup: "Cleanup",
  protection: "Protection",
  speed: "Speed",
  applications: "Applications",
  files: "Files",
};
```

Add `group` to `CleanerItem`:

```typescript
interface CleanerItem {
  key: string;
  name: string;
  size: number;
  detail: string;
  checked: boolean;
  group: string;
}
```

Update items creation to include group from scan module:

```typescript
const items: CleanerItem[] = getModuleList().map((mod) => {
  const scan = scanResults.find((r) => r.key === mod.key);
  return {
    key: mod.key,
    name: mod.name,
    size: scan?.freed ?? 0,
    detail: `${scan?.paths.length ?? 0} paths`,
    checked: false,
    group: (mod as any).group ?? "cleanup",
  };
});
```

Update `renderList` to show group headers as non-selectable separator lines:

```typescript
function renderList(): void {
  const lines: string[] = [];
  const itemIndices: number[] = []; // maps list index to items index
  let lastGroup = "";

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.group !== lastGroup) {
      const label = GROUP_LABELS[item.group] ?? item.group;
      lines.push(`  {bold}{white-fg}-- ${label.toUpperCase()} --{/white-fg}{/bold}`);
      itemIndices.push(-1); // -1 = header, not selectable
      lastGroup = item.group;
    }
    const icon = item.checked ? getIcon("checkbox_on") : getIcon("checkbox_off");
    const sizeStr = item.size > 0 ? formatBytes(item.size) : "0 B";
    lines.push(` ${icon} ${item.name.padEnd(16)} ${sizeStr.padStart(10)}    ${item.detail}`);
    itemIndices.push(i);
  }

  list.setItems(lines);
  // Adjust selectedIdx to skip headers
  let listIdx = itemIndices.indexOf(selectedIdx);
  if (listIdx < 0) listIdx = itemIndices.findIndex((i) => i >= 0);
  list.select(listIdx);
  updateSummary();
}
```

Note: This adds visual group separation. The space/toggle handler also needs to map from list selection back to item index via `itemIndices`. Store `itemIndices` at module scope.

**Step 2: Verify TUI renders**

Run: `npm run dev -- menu`
Expected: Cleaners screen shows group headers between modules

**Step 3: Commit**

```bash
git add src/tui/screens/cleaners.ts
git commit -m "feat: add group headers to TUI cleaners screen"
```

---

### Task 7: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update Commands section**

Replace the flat command table with grouped tables:

```markdown
## Commands

### Cleanup -- free disk space

| Command             | What it cleans |
|---------------------|----------------|
| `cleanup all`       | Everything at once -- safe defaults |
| `cleanup system`    | System logs, temp files & caches |
| `cleanup brew`      | Homebrew cache & old package versions |
| `cleanup node`      | npm/yarn/pnpm caches + orphaned `node_modules` |
| `cleanup browser`   | Chrome, Firefox, Safari, Arc, Brave caches |
| `cleanup docker`    | Unused containers, images, volumes, build cache |
| `cleanup xcode`     | Derived data, device support files, simulators |
| `cleanup cloud`     | Cloud storage caches (iCloud, Dropbox, etc.) |
| `cleanup mail`      | Cached mail attachments and downloads |
| `cleanup mobile-backups` | Old iOS/iPadOS device backups |

### Protection -- security & privacy

| Command             | What it does |
|---------------------|--------------|
| `protection privacy`   | Clear recent files lists, Finder recents |
| `protection keychain`  | Audit stale Keychain entries (read-only) |
| `protection scan`      | Detect accidentally exposed secrets in caches |

### Speed -- performance tuning

| Command             | What it does |
|---------------------|--------------|
| `speed maintain`    | DNS flush, Spotlight rebuild, purge RAM, font caches |
| `speed startup`     | List and inspect Launch Agents (read-only) |

### Applications

| Command             | What it does |
|---------------------|--------------|
| `applications apps` | Find & remove leftover files from uninstalled apps |

### Files -- discovery & management

| Command             | What it does |
|---------------------|--------------|
| `files large-files` | Find and remove large & old files |
| `files duplicates`  | Find and remove duplicate files |
| `files disk-usage`  | Visual disk usage breakdown (Space Lens) |

### Other

| Command    | What it does |
|------------|--------------|
| `upgrade`  | Update mac-cleaner to the latest version |
| `status`   | Show system health overview |
| `menu`     | Launch interactive TUI dashboard |
```

**Step 2: Update Quick start examples**

```markdown
## Quick start

```bash
mac-cleaner cleanup all --dry-run    # See what would be cleaned (safe preview)
mac-cleaner cleanup all              # Clean everything
mac-cleaner cleanup system           # Just system caches and logs
mac-cleaner cleanup node --verbose   # Clean npm/yarn/pnpm with details
mac-cleaner speed maintain           # DNS flush, Spotlight rebuild, etc.
mac-cleaner protection scan          # Check for leaked secrets
```
```

**Step 3: Update Examples section**

```markdown
## Examples

```bash
# Preview a full cleanup without deleting anything
mac-cleaner cleanup all --dry-run

# Clean everything and pipe results to a log
mac-cleaner cleanup all --json | tee cleanup.log | jq .

# Clean node caches and show details
mac-cleaner cleanup node --verbose

# Scan for accidentally exposed secrets (API keys, tokens)
mac-cleaner protection scan

# Run maintenance tasks (DNS flush, Spotlight rebuild)
mac-cleaner speed maintain

# Update mac-cleaner itself
mac-cleaner upgrade
```
```

**Step 4: Add Migration note**

Add a section after Examples:

```markdown
## Migrating from flat commands

Previous flat commands (`mac-cleaner system`, `mac-cleaner clean system`) still work but show a deprecation warning. Update your scripts to use the new grouped syntax:

| Old command | New command |
|---|---|
| `mac-cleaner system` | `mac-cleaner cleanup system` |
| `mac-cleaner clean brew` | `mac-cleaner cleanup brew` |
| `mac-cleaner scan` | `mac-cleaner protection scan` |
| `mac-cleaner disk-usage` | `mac-cleaner files disk-usage` |

Set `MAC_CLEANER_NO_DEPRECATION=1` to suppress warnings.
```

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README with grouped command structure"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all tests**

Run: `npm test`
Expected: All existing tests pass (cleaner tests don't test CLI routing)

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build with no errors

**Step 3: Smoke test all groups**

```bash
npm run dev -- cleanup system --dry-run
npm run dev -- protection privacy --dry-run
npm run dev -- speed maintain --dry-run
npm run dev -- applications apps --dry-run
npm run dev -- files large-files --dry-run
npm run dev -- --help
```

Expected: Each runs the correct cleaner; help shows grouped layout

**Step 4: Smoke test deprecated aliases**

```bash
npm run dev -- system --dry-run 2>&1 | head -1
npm run dev -- clean system --dry-run 2>&1 | head -1
```

Expected: First line contains deprecation warning

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address test/build issues from command grouping"
```
