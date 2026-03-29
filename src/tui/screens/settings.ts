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

  const handlers: Array<{ keys: string[]; fn: () => void }> = [];

  function bindKey(keys: string[], fn: () => void): void {
    handlers.push({ keys, fn });
    screen.key(keys, fn);
  }

  bindKey(["return"], () => {
    const s = settings[selectedIdx];
    if (!s) return;
    const currentIdx = s.options.indexOf(s.value());
    const nextIdx = (currentIdx + 1) % s.options.length;
    s.onChange(s.options[nextIdx]);
    renderList();
    // Re-render the full TUI to apply theme changes
    ctx.switchScreen("settings");
  });

  list.on("select item", (_item: any, index: number) => {
    selectedIdx = index;
    renderPreview();
    screen.render();
  });

  list.focus();
  screen.render();

  return () => {
    for (const h of handlers) {
      for (const k of h.keys) {
        screen.unkey(k, h.fn);
      }
    }
  };
}
