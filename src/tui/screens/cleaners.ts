import blessed from "neo-blessed";
import { getTheme } from "../theme.js";
import { getIcon } from "../icons.js";
import { formatBytes } from "../../utils/du.js";
import { runClean, getModuleList } from "../scan.js";
import { createLoadingOverlay } from "../widgets/loading.js";
import type { TuiContext } from "../index.js";

const GROUP_LABELS: Record<string, string> = {
  cleanup: "Cleanup",
  protection: "Protection",
  speed: "Speed",
  applications: "Applications",
  files: "Files",
};

interface CleanerItem {
  key: string;
  name: string;
  size: number;
  detail: string;
  checked: boolean;
  group: string;
}

export function createCleanersScreen(ctx: TuiContext): () => void {
  const { mainBox, scanResults, log, screen } = ctx;
  const theme = getTheme();
  let dryRun = false;

  const items: CleanerItem[] = getModuleList().map((mod) => {
    const scan = scanResults.find((r) => r.key === mod.key);
    return {
      key: mod.key,
      name: mod.name,
      size: scan?.freed ?? 0,
      detail: `${scan?.paths.length ?? 0} paths`,
      checked: false,
      group: mod.group,
    };
  });

  let selectedIdx = 0;
  // Maps list row index -> items index (-1 for group headers)
  let itemIndices: number[] = [];

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
    const lines: string[] = [];
    itemIndices = [];
    let lastGroup = "";

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.group !== lastGroup) {
        const label = GROUP_LABELS[item.group] ?? item.group;
        lines.push(`  {bold}{white-fg}-- ${label.toUpperCase()} --{/white-fg}{/bold}`);
        itemIndices.push(-1);
        lastGroup = item.group;
      }
      const icon = item.checked ? getIcon("checkbox_on") : getIcon("checkbox_off");
      const sizeStr = item.size > 0 ? formatBytes(item.size) : "0 B";
      lines.push(` ${icon} ${item.name.padEnd(16)} ${sizeStr.padStart(10)}    ${item.detail}`);
      itemIndices.push(i);
    }

    list.setItems(lines);
    // Find the list row that corresponds to selectedIdx, skipping headers
    let listIdx = itemIndices.indexOf(selectedIdx);
    if (listIdx < 0) listIdx = itemIndices.findIndex((i) => i >= 0);
    list.select(listIdx);
    updateSummary();
  }

  /** Map the blessed list's selected row back to an items index. Returns -1 for headers. */
  function getItemIdx(): number {
    const listSel = (list as any).selected ?? 0;
    return itemIndices[listSel] ?? -1;
  }

  function updateSummary(): void {
    const selected = items.filter((i) => i.checked);
    const totalSize = selected.reduce((sum, i) => sum + i.size, 0);
    const modeStr = dryRun
      ? `{${theme.warning}-fg}[DRY RUN]{/${theme.warning}-fg} `
      : "";
    summaryBox.setContent(
      `\n  ${modeStr}Selected: ${selected.length} modules -- ~${formatBytes(totalSize)}` +
      `  {${theme.textDim}-fg}(Space toggle, a all, Enter run, d dry-run){/${theme.textDim}-fg}`,
    );
  }

  renderList();
  mainBox.setLabel(" Cleaners ");

  // -- Key handlers --
  const handlers: Array<{ keys: string[]; fn: () => void }> = [];

  function bindKey(keys: string[], fn: () => void): void {
    handlers.push({ keys, fn });
    screen.key(keys, fn);
  }

  bindKey(["space"], () => {
    const idx = getItemIdx();
    if (idx >= 0 && idx < items.length) {
      selectedIdx = idx;
      items[idx].checked = !items[idx].checked;
      renderList();
    }
    screen.render();
  });

  bindKey(["a"], () => {
    const allChecked = items.every((i) => i.checked);
    for (const item of items) item.checked = !allChecked;
    renderList();
    screen.render();
  });

  bindKey(["d"], () => {
    dryRun = !dryRun;
    updateSummary();
    log.info(dryRun ? "Dry-run mode ON" : "Dry-run mode OFF");
    screen.render();
  });

  bindKey(["return"], () => {
    void (async () => {
      const selected = items.filter((i) => i.checked);
      if (selected.length === 0) {
        log.warn("No modules selected. Use Space to toggle.");
        screen.render();
        return;
      }

      const keys = selected.map((i) => i.key);
      const modeLabel = dryRun ? "Scanning" : "Cleaning";
      const loading = createLoadingOverlay(screen, modeLabel, `${modeLabel} ${selected.length} module(s)...`);
      log.info(`${modeLabel} ${selected.length} module(s)...`);

      const results = await runClean(keys, (name, status, result) => {
        if (status === "start") {
          loading.update(`${modeLabel} ${name}...`);
          log.info(`${modeLabel} ${name}...`);
        } else if (status === "done" && result) {
          log.info(`${name} done -- freed ${formatBytes(result.freed)}`);
        } else if (status === "error") log.error(`${name} failed`);
      });

      loading.destroy();
      const total = results.reduce((sum, r) => sum + r.freed, 0);
      log.info(`${modeLabel} complete. ${dryRun ? "Would free" : "Freed"} ${formatBytes(total)}.`);

      void ctx.refresh();
    })();
  });

  list.focus();
  screen.render();

  // Cleanup: remove key handlers when leaving this screen
  return () => {
    for (const h of handlers) {
      for (const k of h.keys) {
        screen.unkey(k, h.fn);
      }
    }
  };
}
