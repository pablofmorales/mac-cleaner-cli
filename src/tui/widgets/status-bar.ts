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
