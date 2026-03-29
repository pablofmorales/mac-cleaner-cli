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
