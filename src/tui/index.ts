import blessed from "neo-blessed";
import { getTheme } from "./theme.js";
import { getTerminalInfo } from "./detect.js";
import { createMenu, type ScreenName } from "./widgets/menu.js";
import { createLogPanel } from "./widgets/log-panel.js";
import { createStatusBar } from "./widgets/status-bar.js";
import { createDashboardScreen } from "./screens/dashboard.js";
import { createCleanersScreen } from "./screens/cleaners.js";
import { createSettingsScreen } from "./screens/settings.js";
import { scanAll, runClean, type ModuleScanResult } from "./scan.js";
import { createLoadingOverlay } from "./widgets/loading.js";
import { formatBytes } from "../utils/du.js";

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

  // -- Title bar --
  const titleBar = blessed.box({
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
    content: " MAC-CLEANER",
  });

  // -- Menu (left) --
  const menu = createMenu(screen);

  // -- Main area (center-right) --
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

  // -- Log panel (bottom) --
  const logPanel = createLogPanel(screen);

  // -- Status bar (very bottom) --
  const statusBar = createStatusBar(screen);

  // -- State --
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

  // -- Screen switching --
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

  // -- Scan / Refresh --
  async function doRefresh(): Promise<void> {
    const loading = createLoadingOverlay(screen, "Scanning", "Initializing scan...");
    logPanel.info("Scanning all modules...");

    scanResults = await scanAll((name) => {
      loading.update(`Scanning ${name}...`);
      logPanel.scan(`Scanning ${name}...`);
    });

    loading.destroy();
    ctx.scanResults = scanResults;

    const total = scanResults.reduce((sum, r) => sum + r.freed, 0);
    logPanel.info(`Scan complete. ${scanResults.length} modules. ~${formatBytes(total)} reclaimable.`);

    for (const r of scanResults) {
      if (r.errors.length > 0) {
        for (const e of r.errors) {
          logPanel.warn(`${r.name}: ${e}`);
        }
      }
    }

    switchScreen(currentScreen);
  }

  // -- Hotkeys --
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

  screen.key(["f2"], () => {
    void (async () => {
      const loading = createLoadingOverlay(screen, "Quick Clean", "Cleaning system caches...");
      logPanel.info("Quick clean: system + browser caches...");
      const results = await runClean(["system", "browser"], (name, status, result) => {
        if (status === "start") {
          loading.update(`Cleaning ${name}...`);
          logPanel.info(`Cleaning ${name}...`);
        } else if (status === "done" && result) {
          logPanel.info(`${name} done -- freed ${formatBytes(result.freed)}`);
        } else if (status === "error") logPanel.error(`${name} failed`);
      });
      loading.destroy();
      const total = results.reduce((sum, r) => sum + r.freed, 0);
      logPanel.info(`Quick clean complete. Freed ${formatBytes(total)}.`);
      void doRefresh();
    })();
  });

  screen.key(["?"], () => {
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
    const closeHelp = () => {
      helpBox.detach();
      screen.render();
      for (const k of ["escape", "q", "?", "enter", "space"]) {
        screen.unkey(k, closeHelp);
      }
    };
    for (const k of ["escape", "q", "?", "enter", "space"]) {
      screen.key(k, closeHelp);
    }
  });

  // -- Initial render + scan --
  screen.render();
  logPanel.info("Starting mac-cleaner TUI...");
  screen.render();

  await doRefresh();
}
