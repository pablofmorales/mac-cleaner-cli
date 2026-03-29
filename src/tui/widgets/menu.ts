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
