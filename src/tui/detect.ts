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
