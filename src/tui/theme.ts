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
  barLow: string;
  barMedium: string;
  barHigh: string;
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
