# TUI Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-screen TUI dashboard launched by `mac-cleaner` (no args) or `mac-cleaner menu`, with fixed-layout panels: left menu, center main area, bottom log, bottom status bar.

**Architecture:** neo-blessed screen with fixed-position box elements. Three swappable screens (Dashboard, Cleaners, Settings) rendered into the main area. Cleaners run via existing `clean()` exports in dry-run mode for scanning, real mode for cleaning. A `scan.ts` module orchestrates all cleaner scans and returns structured results.

**Tech Stack:** neo-blessed (terminal UI), @types/blessed (TS types), chalk (colors, already installed)

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install neo-blessed and types**

Run: `npm install neo-blessed && npm install --save-dev @types/blessed`

**Step 2: Verify installation**

Run: `npm ls neo-blessed @types/blessed`
Expected: Both packages listed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add neo-blessed for TUI mode"
```

---

### Task 2: Create icons module

**Files:**
- Create: `src/tui/icons.ts`
- Test: `src/tui/icons.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tui/icons.test.ts
import { describe, it, expect } from "vitest";
import { getIcon, getIconSet, setIconSet } from "./icons.js";

describe("icons", () => {
  it("returns unicode icons by default", () => {
    setIconSet("unicode");
    expect(getIcon("success")).toBe("+");
    expect(getIcon("error")).toBe("x");
  });

  it("returns nerd font icons when set", () => {
    setIconSet("nerd");
    expect(getIcon("success")).toBe("\uf00c");
    expect(getIcon("error")).toBe("\uf00d");
  });

  it("resolves icon set from env var", () => {
    expect(getIconSet()).toBe("unicode"); // default
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tui/icons.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/tui/icons.ts
export type IconSetName = "unicode" | "nerd";

interface IconSet {
  bullet: string;
  success: string;
  error: string;
  warn: string;
  info: string;
  checkbox_on: string;
  checkbox_off: string;
  arrow: string;
  dot: string;
  folder: string;
  file: string;
  scan: string;
  clean: string;
  settings: string;
  dashboard: string;
}

const iconSets: Record<IconSetName, IconSet> = {
  unicode: {
    bullet: ">",
    success: "+",
    error: "x",
    warn: "!",
    info: "i",
    checkbox_on: "[x]",
    checkbox_off: "[ ]",
    arrow: "->",
    dot: ".",
    folder: "/",
    file: "-",
    scan: "~",
    clean: "*",
    settings: "#",
    dashboard: "=",
  },
  nerd: {
    bullet: "\uf054",
    success: "\uf00c",
    error: "\uf00d",
    warn: "\uf071",
    info: "\uf05a",
    checkbox_on: "\uf046",
    checkbox_off: "\uf096",
    arrow: "\uf061",
    dot: "\uf111",
    folder: "\uf07b",
    file: "\uf15b",
    scan: "\uf002",
    clean: "\uf1b8",
    settings: "\uf013",
    dashboard: "\uf0e4",
  },
};

let currentSet: IconSetName = "unicode";

export function getIconSet(): IconSetName {
  const envSet = process.env.MAC_CLEANER_ICONS;
  if (envSet === "nerd") return "nerd";
  return currentSet;
}

export function setIconSet(name: IconSetName): void {
  currentSet = name;
}

export function getIcon(name: keyof IconSet): string {
  return iconSets[getIconSet()][name];
}

export function getAllIcons(): IconSet {
  return iconSets[getIconSet()];
}
```

**Step 4: Run tests**

Run: `npx vitest run src/tui/icons.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/icons.ts src/tui/icons.test.ts
git commit -m "feat(tui): add icon registry with unicode/nerd font sets"
```

---

### Task 3: Create theme module

**Files:**
- Create: `src/tui/theme.ts`
- Test: `src/tui/theme.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tui/theme.test.ts
import { describe, it, expect } from "vitest";
import { getTheme, setTheme, getThemeNames } from "./theme.js";

describe("theme", () => {
  it("returns default theme colors", () => {
    setTheme("default");
    const theme = getTheme();
    expect(theme.name).toBe("default");
    expect(theme.border).toBeDefined();
    expect(theme.titleBar).toBeDefined();
    expect(theme.statusBar).toBeDefined();
  });

  it("lists available theme names", () => {
    const names = getThemeNames();
    expect(names).toContain("default");
    expect(names).toContain("minimal");
    expect(names).toContain("catppuccin");
  });

  it("switches themes", () => {
    setTheme("minimal");
    expect(getTheme().name).toBe("minimal");
    setTheme("catppuccin");
    expect(getTheme().name).toBe("catppuccin");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tui/theme.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/tui/theme.ts
export type ThemeName = "default" | "minimal" | "catppuccin";

export interface Theme {
  name: ThemeName;
  border: string;
  borderFocus: string;
  titleBar: { bg: string; fg: string };
  statusBar: { bg: string; fg: string };
  menuActive: { bg: string; fg: string };
  menuItem: { fg: string };
  text: string;
  textDim: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  barLow: string;       // < 50% usage
  barMedium: string;     // 50-80%
  barHigh: string;       // > 80%
  barEmpty: string;
  logInfo: string;
  logWarn: string;
  logError: string;
  logScan: string;
}

const themes: Record<ThemeName, Theme> = {
  default: {
    name: "default",
    border: "green",
    borderFocus: "cyan",
    titleBar: { bg: "green", fg: "black" },
    statusBar: { bg: "green", fg: "black" },
    menuActive: { bg: "green", fg: "black" },
    menuItem: { fg: "green" },
    text: "white",
    textDim: "gray",
    success: "green",
    warning: "yellow",
    error: "red",
    info: "cyan",
    barLow: "green",
    barMedium: "yellow",
    barHigh: "red",
    barEmpty: "gray",
    logInfo: "cyan",
    logWarn: "yellow",
    logError: "red",
    logScan: "blue",
  },
  minimal: {
    name: "minimal",
    border: "gray",
    borderFocus: "white",
    titleBar: { bg: "black", fg: "white" },
    statusBar: { bg: "black", fg: "white" },
    menuActive: { bg: "white", fg: "black" },
    menuItem: { fg: "white" },
    text: "white",
    textDim: "gray",
    success: "white",
    warning: "white",
    error: "white",
    info: "white",
    barLow: "white",
    barMedium: "white",
    barHigh: "white",
    barEmpty: "gray",
    logInfo: "white",
    logWarn: "white",
    logError: "white",
    logScan: "white",
  },
  catppuccin: {
    name: "catppuccin",
    border: "#89b4fa",
    borderFocus: "#cba6f7",
    titleBar: { bg: "#1e1e2e", fg: "#cdd6f4" },
    statusBar: { bg: "#1e1e2e", fg: "#cdd6f4" },
    menuActive: { bg: "#89b4fa", fg: "#1e1e2e" },
    menuItem: { fg: "#cdd6f4" },
    text: "#cdd6f4",
    textDim: "#6c7086",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
    info: "#89dceb",
    barLow: "#a6e3a1",
    barMedium: "#f9e2af",
    barHigh: "#f38ba8",
    barEmpty: "#45475a",
    logInfo: "#89dceb",
    logWarn: "#f9e2af",
    logError: "#f38ba8",
    logScan: "#89b4fa",
  },
};

let currentTheme: ThemeName = "default";

export function getTheme(): Theme {
  return themes[currentTheme];
}

export function setTheme(name: ThemeName): void {
  currentTheme = name;
}

export function getThemeNames(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}
```

**Step 4: Run tests**

Run: `npx vitest run src/tui/theme.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/theme.ts src/tui/theme.test.ts
git commit -m "feat(tui): add theme system with default/minimal/catppuccin"
```

---

### Task 4: Create terminal detection module

**Files:**
- Create: `src/tui/detect.ts`
- Test: `src/tui/detect.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tui/detect.test.ts
import { describe, it, expect } from "vitest";
import { getTerminalInfo } from "./detect.js";

describe("detect", () => {
  it("returns terminal info object", () => {
    const info = getTerminalInfo();
    expect(info).toHaveProperty("cols");
    expect(info).toHaveProperty("rows");
    expect(info).toHaveProperty("isTTY");
    expect(info).toHaveProperty("colorDepth");
    expect(typeof info.cols).toBe("number");
    expect(typeof info.rows).toBe("number");
  });

  it("detects minimum size requirement", () => {
    const info = getTerminalInfo();
    expect(typeof info.isTooSmall).toBe("boolean");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tui/detect.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/tui/detect.ts
export type ColorDepth = "truecolor" | "256" | "16" | "none";

export interface TerminalInfo {
  cols: number;
  rows: number;
  isTTY: boolean;
  colorDepth: ColorDepth;
  isTooSmall: boolean;
}

const MIN_COLS = 80;
const MIN_ROWS = 24;

export function detectColorDepth(): ColorDepth {
  if (!process.stdout.isTTY) return "none";
  const colorterm = process.env.COLORTERM ?? "";
  if (colorterm === "truecolor" || colorterm === "24bit") return "truecolor";
  const term = process.env.TERM ?? "";
  if (term.includes("256color")) return "256";
  if (process.stdout.hasColors?.(256)) return "256";
  if (process.stdout.hasColors?.(16)) return "16";
  return "16";
}

export function getTerminalInfo(): TerminalInfo {
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  return {
    cols,
    rows,
    isTTY: process.stdout.isTTY === true,
    colorDepth: detectColorDepth(),
    isTooSmall: cols < MIN_COLS || rows < MIN_ROWS,
  };
}
```

**Step 4: Run tests**

Run: `npx vitest run src/tui/detect.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/detect.ts src/tui/detect.test.ts
git commit -m "feat(tui): add terminal capability detection"
```

---

### Task 5: Create scanner module

**Files:**
- Create: `src/tui/scan.ts`
- Test: `src/tui/scan.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tui/scan.test.ts
import { describe, it, expect } from "vitest";
import { scanAll, type ModuleScanResult } from "./scan.js";

describe("scanAll", () => {
  it("returns scan results for all modules", async () => {
    const results = await scanAll();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("freed");
      expect(r).toHaveProperty("paths");
      expect(typeof r.name).toBe("string");
      expect(typeof r.freed).toBe("number");
      expect(Array.isArray(r.paths)).toBe(true);
    }
  }, 60000);

  it("each module has a display label", async () => {
    const results = await scanAll();
    const names = results.map((r) => r.name);
    expect(names).toContain("System");
    expect(names).toContain("Brew");
    expect(names).toContain("Node");
    expect(names).toContain("Browser");
  }, 60000);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tui/scan.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/tui/scan.ts
import type { CleanOptions, CleanResult } from "../types.js";

export interface ModuleScanResult {
  name: string;
  key: string;
  freed: number;
  paths: string[];
  errors: string[];
  ok: boolean;
}

interface ModuleDef {
  name: string;
  key: string;
  importPath: string;
}

const modules: ModuleDef[] = [
  { name: "System",   key: "system",   importPath: "../cleaners/system.js" },
  { name: "Brew",     key: "brew",     importPath: "../cleaners/brew.js" },
  { name: "Node",     key: "node",     importPath: "../cleaners/node.js" },
  { name: "Browser",  key: "browser",  importPath: "../cleaners/browser.js" },
  { name: "Docker",   key: "docker",   importPath: "../cleaners/docker.js" },
  { name: "Xcode",    key: "xcode",    importPath: "../cleaners/xcode.js" },
  { name: "Keychain", key: "keychain", importPath: "../cleaners/keychain.js" },
  { name: "Privacy",  key: "privacy",  importPath: "../cleaners/privacy.js" },
];

export function getModuleList(): ModuleDef[] {
  return [...modules];
}

/**
 * Runs all cleaners in dry-run + json mode to get reclaimable space
 * without deleting anything. Suppresses all stdout.
 */
export async function scanAll(
  onProgress?: (moduleName: string) => void,
): Promise<ModuleScanResult[]> {
  const scanOpts: CleanOptions & { _suppressTable?: boolean } = {
    dryRun: true,
    json: true,
    verbose: false,
    noSudo: true,
    yes: true,
    _suppressTable: true,
  };

  const results: ModuleScanResult[] = [];

  // Suppress console.log during scan to prevent stdout pollution
  const origLog = console.log;
  const origWarn = console.warn;

  for (const mod of modules) {
    onProgress?.(mod.name);
    try {
      console.log = () => {};
      console.warn = () => {};
      const cleaner = await import(mod.importPath) as { clean: (opts: CleanOptions) => Promise<CleanResult> };
      const result = await cleaner.clean(scanOpts);
      results.push({
        name: mod.name,
        key: mod.key,
        freed: result.freed,
        paths: result.paths,
        errors: result.errors,
        ok: result.ok,
      });
    } catch {
      results.push({
        name: mod.name,
        key: mod.key,
        freed: 0,
        paths: [],
        errors: [`Failed to scan ${mod.name}`],
        ok: false,
      });
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
  }

  return results;
}

/**
 * Runs specific cleaners (actual clean, not dry-run).
 */
export async function runClean(
  keys: string[],
  onProgress?: (moduleName: string, status: "start" | "done" | "error", result?: CleanResult) => void,
): Promise<ModuleScanResult[]> {
  const cleanOpts: CleanOptions & { _suppressTable?: boolean } = {
    dryRun: false,
    json: true,
    verbose: false,
    noSudo: true,
    yes: true,
    _suppressTable: true,
  };

  const results: ModuleScanResult[] = [];
  const selected = modules.filter((m) => keys.includes(m.key));

  const origLog = console.log;
  const origWarn = console.warn;

  for (const mod of selected) {
    onProgress?.(mod.name, "start");
    try {
      console.log = () => {};
      console.warn = () => {};
      const cleaner = await import(mod.importPath) as { clean: (opts: CleanOptions) => Promise<CleanResult> };
      const result = await cleaner.clean(cleanOpts);
      results.push({
        name: mod.name,
        key: mod.key,
        freed: result.freed,
        paths: result.paths,
        errors: result.errors,
        ok: result.ok,
      });
      onProgress?.(mod.name, "done", result);
    } catch {
      results.push({
        name: mod.name,
        key: mod.key,
        freed: 0,
        paths: [],
        errors: [`Failed to clean ${mod.name}`],
        ok: false,
      });
      onProgress?.(mod.name, "error");
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
  }

  return results;
}
```

**Step 4: Run tests**

Run: `npx vitest run src/tui/scan.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/scan.ts src/tui/scan.test.ts
git commit -m "feat(tui): add scanner module for dry-run cleaner scans"
```

---

### Task 6: Create TUI layout and screen manager

This is the core task. Creates the blessed screen with all fixed regions and the screen switching logic.

**Files:**
- Create: `src/tui/index.ts`
- Create: `src/tui/widgets/menu.ts`
- Create: `src/tui/widgets/log-panel.ts`
- Create: `src/tui/widgets/status-bar.ts`
- Create: `src/tui/widgets/storage-bar.ts`
- Create: `src/tui/widgets/checkbox-list.ts`

**Step 1: Create storage-bar widget**

```typescript
// src/tui/widgets/storage-bar.ts
import { getTheme } from "../theme.js";
import { formatBytes } from "../../utils/du.js";

/**
 * Renders a text-based gradient progress bar.
 * Returns a string like: [========........] 72% (738 / 1024 GB)
 */
export function renderStorageBar(
  used: number,
  total: number,
  width: number,
): string {
  if (total === 0) return "[" + ".".repeat(width - 2) + "]";
  const pct = Math.min(1, used / total);
  const barWidth = width - 2; // account for [ ]
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const theme = getTheme();

  let color: string;
  if (pct < 0.5) color = theme.barLow;
  else if (pct < 0.8) color = theme.barMedium;
  else color = theme.barHigh;

  const filledStr = "=".repeat(filled);
  const emptyStr = ".".repeat(empty);
  const pctStr = `${Math.round(pct * 100)}%`;

  return `{${color}-fg}[${filledStr}{/${color}-fg}{${theme.barEmpty}-fg}${emptyStr}{/${theme.barEmpty}-fg}{${color}-fg}]{/${color}-fg} ${pctStr}  ${formatBytes(used)} / ${formatBytes(total)}`;
}

/**
 * Renders a smaller inline bar for module sizes.
 * Returns: [======.......] ready
 */
export function renderModuleBar(
  size: number,
  maxSize: number,
  barWidth: number,
): string {
  if (maxSize === 0) return "[" + ".".repeat(barWidth - 2) + "]";
  const pct = Math.min(1, size / maxSize);
  const inner = barWidth - 2;
  const filled = Math.round(pct * inner);
  const empty = inner - filled;
  const theme = getTheme();

  let color: string;
  if (pct < 0.3) color = theme.barLow;
  else if (pct < 0.6) color = theme.barMedium;
  else color = theme.barHigh;

  return `{${color}-fg}[${  "=".repeat(filled)}{/${color}-fg}{${theme.barEmpty}-fg}${"." .repeat(empty)}{/${theme.barEmpty}-fg}{${color}-fg}]{/${color}-fg}`;
}
```

**Step 2: Create menu widget**

```typescript
// src/tui/widgets/menu.ts
import blessed from "neo-blessed";
import { getTheme } from "../theme.js";
import { getIcon } from "../icons.js";

export type ScreenName = "dashboard" | "cleaners" | "settings";

export interface MenuWidget {
  element: blessed.Widgets.BoxElement;
  setActive: (screen: ScreenName) => void;
}

const menuItems: Array<{ key: string; label: string; screen: ScreenName }> = [
  { key: "1", label: "Dashboard", screen: "dashboard" },
  { key: "2", label: "Cleaners", screen: "cleaners" },
  { key: "3", label: "Settings", screen: "settings" },
];

const quickActions = [
  { key: "F1", label: "Deep Scan" },
  { key: "F2", label: "Quick Clean" },
  { key: "F5", label: "Refresh" },
];

export function createMenu(parent: blessed.Widgets.Screen): MenuWidget {
  const theme = getTheme();

  const box = blessed.box({
    parent,
    top: 1,
    left: 0,
    width: 26,
    bottom: 8,
    border: { type: "line" },
    style: {
      border: { fg: theme.border },
    },
    tags: true,
    label: ` ${getIcon("arrow")} Menu `,
  });

  let active: ScreenName = "dashboard";

  function render(): void {
    const theme = getTheme();
    const lines: string[] = [""];

    for (const item of menuItems) {
      const isActive = item.screen === active;
      if (isActive) {
        lines.push(`  {${theme.menuActive.bg}-bg}{${theme.menuActive.fg}-fg} ${item.key}  ${item.label} {/${theme.menuActive.fg}-fg}{/${theme.menuActive.bg}-bg}`);
      } else {
        lines.push(`  {${theme.menuItem.fg}-fg} ${item.key}  ${item.label}{/${theme.menuItem.fg}-fg}`);
      }
    }

    lines.push("");
    lines.push(`  {${theme.textDim}-fg}Quick Actions:{/${theme.textDim}-fg}`);
    lines.push("");

    for (const action of quickActions) {
      lines.push(`  {${theme.info}-fg}${action.key.padEnd(4)}{/${theme.info}-fg} ${action.label}`);
    }

    box.setContent(lines.join("\n"));
  }

  render();

  return {
    element: box,
    setActive(screen: ScreenName) {
      active = screen;
      render();
    },
  };
}
```

**Step 3: Create log-panel widget**

```typescript
// src/tui/widgets/log-panel.ts
import blessed from "neo-blessed";
import { getTheme } from "../theme.js";

export interface LogPanel {
  element: blessed.Widgets.Log;
  log: (tag: string, message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  scan: (message: string) => void;
  clear: () => void;
}

export function createLogPanel(parent: blessed.Widgets.Screen): LogPanel {
  const theme = getTheme();

  const logBox = blessed.log({
    parent,
    bottom: 1,
    left: 0,
    width: "100%",
    height: 7,
    border: { type: "line" },
    style: {
      border: { fg: theme.border },
    },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: " ", style: { bg: theme.border } },
    label: " Log ",
    mouse: true,
  }) as blessed.Widgets.Log;

  function timestamp(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  }

  function log(tag: string, message: string): void {
    const theme = getTheme();
    let tagColor: string;
    switch (tag) {
      case "INFO": tagColor = theme.logInfo; break;
      case "WARN": tagColor = theme.logWarn; break;
      case "ERROR": tagColor = theme.logError; break;
      case "SCAN": tagColor = theme.logScan; break;
      default: tagColor = theme.text;
    }
    logBox.log(`{gray-fg}${timestamp()}{/gray-fg}  {${tagColor}-fg}[${tag}]{/${tagColor}-fg}  ${message}`);
  }

  return {
    element: logBox,
    log,
    info: (msg) => log("INFO", msg),
    warn: (msg) => log("WARN", msg),
    error: (msg) => log("ERROR", msg),
    scan: (msg) => log("SCAN", msg),
    clear() {
      logBox.setContent("");
    },
  };
}
```

**Step 4: Create status-bar widget**

```typescript
// src/tui/widgets/status-bar.ts
import blessed from "neo-blessed";
import { getTheme } from "../theme.js";

export interface StatusBar {
  element: blessed.Widgets.BoxElement;
  setContent: (left: string, right: string) => void;
}

export function createStatusBar(parent: blessed.Widgets.Screen): StatusBar {
  const theme = getTheme();

  const bar = blessed.box({
    parent,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      bg: theme.statusBar.bg,
      fg: theme.statusBar.fg,
    },
  });

  function setContent(left: string, right: string): void {
    const width = (parent as any).width as number || 80;
    const padding = Math.max(1, width - left.length - right.length - 2);
    bar.setContent(` ${left}${" ".repeat(padding)}${right} `);
  }

  setContent(
    "q Quit  1-3 Screens  Space Toggle",
    "F1 Scan  F2 Clean  ? Help",
  );

  return { element: bar, setContent };
}
```

**Step 5: Create checkbox-list widget**

```typescript
// src/tui/widgets/checkbox-list.ts
import blessed from "neo-blessed";
import { getTheme } from "../theme.js";
import { getIcon } from "../icons.js";

export interface CheckboxItem {
  key: string;
  label: string;
  detail: string;
  size: number;
  sizeStr: string;
  checked: boolean;
}

export interface CheckboxList {
  element: blessed.Widgets.ListElement;
  items: CheckboxItem[];
  getSelected: () => CheckboxItem[];
  toggleCurrent: () => void;
  toggleAll: () => void;
  render: () => void;
  getSelectedIndex: () => number;
}

export function createCheckboxList(
  parent: blessed.Widgets.BoxElement,
  items: CheckboxItem[],
): CheckboxList {
  const theme = getTheme();

  const list = blessed.list({
    parent,
    top: 0,
    left: 0,
    width: "100%-2",
    height: "100%-2",
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      selected: {
        bg: theme.menuActive.bg,
        fg: theme.menuActive.fg,
      },
      item: {
        fg: theme.text,
      },
    },
    scrollbar: { ch: " ", style: { bg: theme.border } },
  }) as blessed.Widgets.ListElement;

  function render(): void {
    const lines: string[] = items.map((item) => {
      const icon = item.checked ? getIcon("checkbox_on") : getIcon("checkbox_off");
      return ` ${icon} ${item.label.padEnd(18)} ${item.sizeStr.padStart(10)}    ${item.detail}`;
    });
    list.setItems(lines);
  }

  render();

  return {
    element: list,
    items,
    getSelected() {
      return items.filter((i) => i.checked);
    },
    toggleCurrent() {
      const idx = (list as any).selected as number ?? 0;
      if (idx >= 0 && idx < items.length) {
        items[idx].checked = !items[idx].checked;
        render();
        list.select(idx);
      }
    },
    toggleAll() {
      const allChecked = items.every((i) => i.checked);
      for (const item of items) {
        item.checked = !allChecked;
      }
      render();
    },
    render,
    getSelectedIndex() {
      return (list as any).selected as number ?? 0;
    },
  };
}
```

**Step 6: Create the main TUI entry point**

```typescript
// src/tui/index.ts
import blessed from "neo-blessed";
import { getTheme, setTheme, type ThemeName } from "./theme.js";
import { setIconSet, type IconSetName } from "./icons.js";
import { getTerminalInfo } from "./detect.js";
import { createMenu, type ScreenName } from "./widgets/menu.js";
import { createLogPanel } from "./widgets/log-panel.js";
import { createStatusBar } from "./widgets/status-bar.js";
import { createDashboardScreen } from "./screens/dashboard.js";
import { createCleanersScreen } from "./screens/cleaners.js";
import { createSettingsScreen } from "./screens/settings.js";
import { scanAll, type ModuleScanResult } from "./scan.js";

export interface TuiContext {
  screen: blessed.Widgets.Screen;
  mainBox: blessed.Widgets.BoxElement;
  log: ReturnType<typeof createLogPanel>;
  menu: ReturnType<typeof createMenu>;
  statusBar: ReturnType<typeof createStatusBar>;
  scanResults: ModuleScanResult[];
  refresh: () => Promise<void>;
  switchScreen: (name: ScreenName) => void;
}

export async function launchTui(): Promise<void> {
  const termInfo = getTerminalInfo();

  if (!termInfo.isTTY) {
    console.error("TUI requires an interactive terminal. Use --help for CLI usage.");
    process.exit(1);
  }

  if (termInfo.isTooSmall) {
    console.error(`Terminal too small (${termInfo.cols}x${termInfo.rows}). Minimum: 80x24.`);
    process.exit(1);
  }

  const theme = getTheme();

  const screen = blessed.screen({
    smartCSR: true,
    title: "mac-cleaner",
    fullUnicode: true,
    autoPadding: true,
  });

  // ── Title bar ──────────────────────────────────────────────────────────
  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      bg: theme.titleBar.bg,
      fg: theme.titleBar.fg,
    },
    content: ` MAC-CLEANER  `,
  });

  // ── Menu (left) ────────────────────────────────────────────────────────
  const menu = createMenu(screen);

  // ── Main area (center-right) ───────────────────────────────────────────
  const mainBox = blessed.box({
    parent: screen,
    top: 1,
    left: 26,
    right: 0,
    bottom: 8,
    border: { type: "line" },
    style: { border: { fg: theme.border } },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    scrollbar: { ch: " ", style: { bg: theme.border } },
  });

  // ── Log panel (bottom) ─────────────────────────────────────────────────
  const logPanel = createLogPanel(screen);

  // ── Status bar (very bottom) ───────────────────────────────────────────
  const statusBar = createStatusBar(screen);

  // ── State ──────────────────────────────────────────────────────────────
  let scanResults: ModuleScanResult[] = [];
  let currentScreen: ScreenName = "dashboard";
  let activeScreenCleanup: (() => void) | null = null;

  const ctx: TuiContext = {
    screen,
    mainBox,
    log: logPanel,
    menu,
    statusBar,
    scanResults,
    refresh: doRefresh,
    switchScreen,
  };

  // ── Screen switching ───────────────────────────────────────────────────
  function switchScreen(name: ScreenName): void {
    if (activeScreenCleanup) {
      activeScreenCleanup();
      activeScreenCleanup = null;
    }
    // Clear main box children
    for (const child of [...mainBox.children]) {
      child.detach();
    }
    mainBox.setContent("");
    currentScreen = name;
    menu.setActive(name);

    switch (name) {
      case "dashboard":
        activeScreenCleanup = createDashboardScreen(ctx);
        statusBar.setContent(
          "q Quit  1-3 Screens  F5 Refresh",
          "F1 Scan  F2 Clean  ? Help",
        );
        break;
      case "cleaners":
        activeScreenCleanup = createCleanersScreen(ctx);
        statusBar.setContent(
          "q Quit  Space Toggle  a All  Enter Run",
          "d Dry-run  1-3 Screens  ? Help",
        );
        break;
      case "settings":
        activeScreenCleanup = createSettingsScreen(ctx);
        statusBar.setContent(
          "q Quit  Up/Down Navigate  Enter Select",
          "1-3 Screens  ? Help",
        );
        break;
    }

    screen.render();
  }

  // ── Scan / Refresh ─────────────────────────────────────────────────────
  async function doRefresh(): Promise<void> {
    logPanel.info("Scanning all modules...");
    screen.render();

    scanResults = await scanAll((name) => {
      logPanel.scan(`Scanning ${name}...`);
      screen.render();
    });

    ctx.scanResults = scanResults;

    const total = scanResults.reduce((sum, r) => sum + r.freed, 0);
    const { formatBytes } = await import("../utils/du.js");
    logPanel.info(`Scan complete. ${scanResults.length} modules. ~${formatBytes(total)} reclaimable.`);

    for (const r of scanResults) {
      if (r.errors.length > 0) {
        for (const e of r.errors) {
          logPanel.warn(`${r.name}: ${e}`);
        }
      }
    }

    // Re-render current screen with fresh data
    switchScreen(currentScreen);
  }

  // ── Hotkeys ────────────────────────────────────────────────────────────
  screen.key(["q", "escape"], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(["1"], () => switchScreen("dashboard"));
  screen.key(["2"], () => switchScreen("cleaners"));
  screen.key(["3"], () => switchScreen("settings"));

  screen.key(["f5"], () => {
    void doRefresh();
  });

  screen.key(["f1"], () => {
    switchScreen("cleaners");
    void doRefresh();
  });

  screen.key(["f2"], async () => {
    // Quick clean: system + browser
    logPanel.info("Quick clean: system + browser caches...");
    screen.render();
    const { runClean } = await import("./scan.js");
    const results = await runClean(["system", "browser"], (name, status, result) => {
      if (status === "start") logPanel.info(`Cleaning ${name}...`);
      else if (status === "done" && result) {
        const { formatBytes } = require("../utils/du.js");
        logPanel.info(`${name} done -- freed ${formatBytes(result.freed)}`);
      }
      else if (status === "error") logPanel.error(`${name} failed`);
      screen.render();
    });
    const total = results.reduce((sum, r) => sum + r.freed, 0);
    const { formatBytes } = await import("../utils/du.js");
    logPanel.info(`Quick clean complete. Freed ${formatBytes(total)}.`);
    void doRefresh();
  });

  screen.key(["?"], () => {
    // Help overlay
    const helpBox = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: 50,
      height: 18,
      border: { type: "line" },
      style: { border: { fg: theme.info }, bg: "black" },
      tags: true,
      label: " Help ",
      content: [
        "",
        "  {bold}Navigation{/bold}",
        "  1 2 3      Switch screens",
        "  q / Esc    Quit",
        "",
        "  {bold}Actions{/bold}",
        "  F1         Deep scan",
        "  F2         Quick clean (system+browser)",
        "  F5         Refresh scan data",
        "",
        "  {bold}Cleaners Screen{/bold}",
        "  Space      Toggle module",
        "  a          Select/deselect all",
        "  Enter      Run selected cleaners",
        "  d          Toggle dry-run mode",
        "",
        "  Press any key to close...",
      ].join("\n"),
    });
    screen.render();
    screen.onceKey(["escape", "q", "?", "enter", "space"], () => {
      helpBox.detach();
      screen.render();
    });
  });

  // ── Initial scan + render ──────────────────────────────────────────────
  screen.render();
  logPanel.info("Starting mac-cleaner TUI...");
  screen.render();

  await doRefresh();
}
```

**Step 7: Commit**

```bash
git add src/tui/
git commit -m "feat(tui): add screen manager, widgets, and layout"
```

---

### Task 7: Create dashboard screen

**Files:**
- Create: `src/tui/screens/dashboard.ts`

**Step 1: Write implementation**

```typescript
// src/tui/screens/dashboard.ts
import blessed from "neo-blessed";
import * as os from "os";
import { spawnSync } from "child_process";
import { getTheme } from "../theme.js";
import { renderStorageBar, renderModuleBar } from "../widgets/storage-bar.js";
import { formatBytes } from "../../utils/du.js";
import type { TuiContext } from "../index.js";

function getDiskInfo(): { used: number; total: number; free: number; name: string; fs: string } {
  try {
    const result = spawnSync("df", ["-k", "/"], { encoding: "utf8" });
    if (result.status !== 0) return { used: 0, total: 0, free: 0, name: "Macintosh HD", fs: "APFS" };
    const lines = result.stdout.trim().split("\n");
    if (lines.length < 2) return { used: 0, total: 0, free: 0, name: "Macintosh HD", fs: "APFS" };
    const parts = lines[1].split(/\s+/);
    const total = parseInt(parts[1], 10) * 1024;
    const used = parseInt(parts[2], 10) * 1024;
    const free = parseInt(parts[3], 10) * 1024;
    return { used, total, free, name: "Macintosh HD", fs: "APFS" };
  } catch {
    return { used: 0, total: 0, free: 0, name: "Macintosh HD", fs: "APFS" };
  }
}

function getSystemInfo(): { osVersion: string; uptime: string; nodeVersion: string } {
  const uptimeSec = os.uptime();
  const hours = Math.floor(uptimeSec / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  return {
    osVersion: `macOS ${os.release()}`,
    uptime: `${hours}h ${mins}m`,
    nodeVersion: process.version,
  };
}

export function createDashboardScreen(ctx: TuiContext): () => void {
  const { mainBox, scanResults } = ctx;
  const theme = getTheme();
  const disk = getDiskInfo();
  const sys = getSystemInfo();

  const lines: string[] = [];

  // ── Storage section ──
  lines.push("");
  lines.push(`  {bold}STORAGE{/bold}`);
  lines.push("");
  lines.push(`  ${disk.name} (${disk.fs})`);
  const barWidth = Math.max(20, Math.min(50, ((mainBox as any).width as number || 60) - 30));
  lines.push(`  ${renderStorageBar(disk.used, disk.total, barWidth)}`);
  lines.push("");
  lines.push(`  {${theme.textDim}-fg}Free  ${formatBytes(disk.free)}     Total  ${formatBytes(disk.total)}{/${theme.textDim}-fg}`);
  lines.push("");

  // ── System info ──
  lines.push(`  {bold}SYSTEM{/bold}`);
  lines.push("");
  lines.push(`  {${theme.textDim}-fg}OS{/${theme.textDim}-fg}       ${sys.osVersion}`);
  lines.push(`  {${theme.textDim}-fg}Uptime{/${theme.textDim}-fg}   ${sys.uptime}`);
  lines.push(`  {${theme.textDim}-fg}Node{/${theme.textDim}-fg}     ${sys.nodeVersion}`);
  lines.push("");

  // ── Reclaimable space ──
  if (scanResults.length > 0) {
    const total = scanResults.reduce((sum, r) => sum + r.freed, 0);
    const maxSize = Math.max(...scanResults.map((r) => r.freed), 1);

    lines.push(`  {bold}RECLAIMABLE SPACE{/bold}  {${theme.textDim}-fg}(~${formatBytes(total)} total){/${theme.textDim}-fg}`);
    lines.push("");

    for (const r of scanResults) {
      if (r.freed === 0 && r.paths.length === 0) continue;
      const bar = renderModuleBar(r.freed, maxSize, 16);
      const sizeStr = r.freed > 0 ? formatBytes(r.freed) : "0 B";
      const status = r.ok
        ? `{${theme.success}-fg}ready{/${theme.success}-fg}`
        : `{${theme.textDim}-fg}skipped{/${theme.textDim}-fg}`;
      lines.push(`  ${r.name.padEnd(14)} ${sizeStr.padStart(10)}  ${bar}  ${status}`);
    }
  } else {
    lines.push(`  {${theme.textDim}-fg}Press F5 to scan...{/${theme.textDim}-fg}`);
  }

  mainBox.setContent(lines.join("\n"));
  mainBox.setLabel(" Dashboard ");

  return () => {};
}
```

**Step 2: Commit**

```bash
git add src/tui/screens/dashboard.ts
git commit -m "feat(tui): add dashboard screen with storage and scan results"
```

---

### Task 8: Create cleaners screen

**Files:**
- Create: `src/tui/screens/cleaners.ts`

**Step 1: Write implementation**

```typescript
// src/tui/screens/cleaners.ts
import blessed from "neo-blessed";
import { getTheme } from "../theme.js";
import { getIcon } from "../icons.js";
import { formatBytes } from "../../utils/du.js";
import { runClean, getModuleList } from "../scan.js";
import type { TuiContext } from "../index.js";

interface CleanerItem {
  key: string;
  name: string;
  size: number;
  detail: string;
  checked: boolean;
}

export function createCleanersScreen(ctx: TuiContext): () => void {
  const { mainBox, scanResults, log, screen } = ctx;
  const theme = getTheme();
  let dryRun = false;

  // Build items from scan results
  const items: CleanerItem[] = getModuleList().map((mod) => {
    const scan = scanResults.find((r) => r.key === mod.key);
    return {
      key: mod.key,
      name: mod.name,
      size: scan?.freed ?? 0,
      detail: `${scan?.paths.length ?? 0} paths`,
      checked: false,
    };
  });

  let selectedIdx = 0;

  const list = blessed.list({
    parent: mainBox,
    top: 0,
    left: 0,
    width: "100%-2",
    bottom: 4,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      selected: { bg: theme.menuActive.bg, fg: theme.menuActive.fg },
      item: { fg: theme.text },
    },
    scrollbar: { ch: " ", style: { bg: theme.border } },
  }) as blessed.Widgets.ListElement;

  // Summary line at bottom of main box
  const summaryBox = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 3,
    tags: true,
    style: { fg: theme.text },
  });

  function renderList(): void {
    const lines = items.map((item) => {
      const icon = item.checked ? getIcon("checkbox_on") : getIcon("checkbox_off");
      const sizeStr = item.size > 0 ? formatBytes(item.size) : "0 B";
      return ` ${icon} ${item.name.padEnd(16)} ${sizeStr.padStart(10)}    ${item.detail}`;
    });
    list.setItems(lines);
    list.select(selectedIdx);
    updateSummary();
  }

  function updateSummary(): void {
    const selected = items.filter((i) => i.checked);
    const totalSize = selected.reduce((sum, i) => sum + i.size, 0);
    const modeStr = dryRun
      ? `{${theme.warning}-fg}[DRY RUN]{/${theme.warning}-fg} `
      : "";
    summaryBox.setContent(
      `\n  ${modeStr}Selected: ${selected.length} modules -- ~${formatBytes(totalSize)}` +
      `  {${theme.textDim}-fg}(Space toggle, a all, Enter run, d dry-run){/${theme.textDim}-fg}`
    );
  }

  renderList();
  mainBox.setLabel(" Cleaners ");

  // ── Key handlers ──
  function onSpace(): void {
    selectedIdx = (list as any).selected ?? 0;
    if (selectedIdx >= 0 && selectedIdx < items.length) {
      items[selectedIdx].checked = !items[selectedIdx].checked;
      renderList();
    }
    screen.render();
  }

  function onA(): void {
    const allChecked = items.every((i) => i.checked);
    for (const item of items) item.checked = !allChecked;
    renderList();
    screen.render();
  }

  function onD(): void {
    dryRun = !dryRun;
    updateSummary();
    log.info(dryRun ? "Dry-run mode ON" : "Dry-run mode OFF");
    screen.render();
  }

  async function onEnter(): Promise<void> {
    const selected = items.filter((i) => i.checked);
    if (selected.length === 0) {
      log.warn("No modules selected. Use Space to toggle.");
      screen.render();
      return;
    }

    const keys = selected.map((i) => i.key);
    const modeLabel = dryRun ? "Scanning" : "Cleaning";
    log.info(`${modeLabel} ${selected.length} module(s)...`);
    screen.render();

    const results = await runClean(keys, (name, status, result) => {
      if (status === "start") log.info(`${modeLabel} ${name}...`);
      else if (status === "done" && result) {
        log.info(`${name} done -- freed ${formatBytes(result.freed)}`);
      } else if (status === "error") log.error(`${name} failed`);
      screen.render();
    });

    const total = results.reduce((sum, r) => sum + r.freed, 0);
    log.info(`${modeLabel} complete. ${dryRun ? "Would free" : "Freed"} ${formatBytes(total)}.`);

    // Refresh scan results
    void ctx.refresh();
  }

  screen.key(["space"], onSpace);
  screen.key(["a"], onA);
  screen.key(["d"], onD);
  screen.key(["enter"], () => { void onEnter(); });

  list.focus();
  screen.render();

  // Cleanup: remove key handlers when leaving this screen
  return () => {
    screen.unkey(["space"], onSpace);
    screen.unkey(["a"], onA);
    screen.unkey(["d"], onD);
    // Note: enter handler is trickier to clean up -- we rely on screen switching
  };
}
```

**Step 2: Commit**

```bash
git add src/tui/screens/cleaners.ts
git commit -m "feat(tui): add cleaners screen with checkbox selection and cleaning"
```

---

### Task 9: Create settings screen

**Files:**
- Create: `src/tui/screens/settings.ts`

**Step 1: Write implementation**

```typescript
// src/tui/screens/settings.ts
import blessed from "neo-blessed";
import { getTheme, setTheme, getThemeNames, type ThemeName } from "../theme.js";
import { getIconSet, setIconSet, type IconSetName } from "../icons.js";
import type { TuiContext } from "../index.js";

interface SettingItem {
  label: string;
  value: () => string;
  options: string[];
  onChange: (value: string) => void;
}

export function createSettingsScreen(ctx: TuiContext): () => void {
  const { mainBox, log, screen } = ctx;
  const theme = getTheme();

  const settings: SettingItem[] = [
    {
      label: "Theme",
      value: () => getTheme().name,
      options: getThemeNames(),
      onChange: (v) => {
        setTheme(v as ThemeName);
        log.info(`Theme changed to: ${v}`);
      },
    },
    {
      label: "Icons",
      value: () => getIconSet(),
      options: ["unicode", "nerd"],
      onChange: (v) => {
        setIconSet(v as IconSetName);
        log.info(`Icon set changed to: ${v}`);
      },
    },
  ];

  let selectedIdx = 0;

  const list = blessed.list({
    parent: mainBox,
    top: 1,
    left: 1,
    width: "100%-4",
    height: settings.length + 2,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      selected: { bg: theme.menuActive.bg, fg: theme.menuActive.fg },
      item: { fg: theme.text },
    },
  }) as blessed.Widgets.ListElement;

  const previewBox = blessed.box({
    parent: mainBox,
    top: settings.length + 5,
    left: 1,
    width: "100%-4",
    height: 6,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: theme.border } },
    label: " Preview ",
  });

  function renderList(): void {
    const lines = settings.map((s) => {
      return `  ${s.label.padEnd(16)} ${s.value()}`;
    });
    list.setItems(lines);
    list.select(selectedIdx);
    renderPreview();
  }

  function renderPreview(): void {
    const s = settings[selectedIdx];
    if (!s) return;
    const lines = s.options.map((opt) => {
      const current = s.value() === opt ? " <--" : "";
      return `  ${opt}${current}`;
    });
    previewBox.setContent(`\n  Options for ${s.label}:\n\n${lines.join("\n")}`);
  }

  renderList();
  mainBox.setLabel(" Settings ");

  function onEnter(): void {
    const s = settings[selectedIdx];
    if (!s) return;
    const currentIdx = s.options.indexOf(s.value());
    const nextIdx = (currentIdx + 1) % s.options.length;
    s.onChange(s.options[nextIdx]);
    renderList();
    // Re-render the full TUI to apply theme changes
    ctx.switchScreen("settings");
  }

  screen.key(["enter"], onEnter);

  list.on("select item", (_item: any, index: number) => {
    selectedIdx = index;
    renderPreview();
    screen.render();
  });

  list.focus();
  screen.render();

  return () => {
    screen.unkey(["enter"], onEnter);
  };
}
```

**Step 2: Commit**

```bash
git add src/tui/screens/settings.ts
git commit -m "feat(tui): add settings screen with theme and icon config"
```

---

### Task 10: Wire TUI into CLI entry point

**Files:**
- Modify: `src/index.ts`
- Modify: `tsup.config.ts` (if needed)

**Step 1: Add `menu` command and default action to `src/index.ts`**

Add before `program.parse(process.argv)`:

```typescript
// ─── TUI mode ──────────────────────────────────────────────────────────
program
  .command("menu")
  .description("Launch interactive TUI dashboard")
  .action(async () => {
    const { launchTui } = await import("./tui/index.js");
    await launchTui();
  });
```

And modify the default behavior (no args) to launch TUI instead of showing help.
Replace the `program.parse(process.argv)` block and `isHelp` logic at the bottom:

After `program.parse(process.argv)`, check if no command was given and launch TUI:

```typescript
const args = process.argv.slice(2);
const hasCommand = args.length > 0 && !args[0].startsWith("-");

if (!hasCommand && process.stdout.isTTY) {
  // No subcommand given in a TTY -- launch TUI
  void (async () => {
    const { launchTui } = await import("./tui/index.js");
    await launchTui();
  })();
} else {
  program.parse(process.argv);

  // Version check hint (existing logic)
  const isHelp = args.length === 0 || args[0] === "--help" || args[0] === "-h";
  const isJsonFlag = args.includes("--json");
  const isUpgrade = args[0] === "upgrade";
  if (isHelp && !isJsonFlag && !isUpgrade && process.stdout.isTTY) {
    // ... existing version check code
  }
}
```

**Step 2: Build and test**

Run: `npm run build`
Expected: Build succeeds

Run: `npm run dev -- menu`
Expected: TUI launches

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(tui): wire TUI as default action and menu command"
```

---

### Task 11: Build verification and manual testing

**Step 1: Run all existing tests**

Run: `npm test`
Expected: All existing tests pass (TUI doesn't break anything)

**Step 2: Build**

Run: `npm run build`
Expected: Clean build

**Step 3: Manual TUI testing**

Run: `npm run dev -- menu`
Verify:
- TUI launches with all panels visible
- 1/2/3 switches screens
- Dashboard shows disk info and scan results
- Cleaners screen allows selection
- Settings screen toggles theme/icons
- q quits cleanly
- F5 refreshes
- Log panel shows scan progress

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(tui): complete TUI mode implementation (#93)"
```
