import { getTheme } from "../theme.js";
import { formatBytes } from "../../utils/du.js";

/**
 * Renders a text-based gradient progress bar with blessed tags.
 * Returns: {color}[========........]{/color} 72%  738 GB / 1024 GB
 */
export function renderStorageBar(
  used: number,
  total: number,
  width: number,
): string {
  if (total === 0) return "[" + ".".repeat(width - 2) + "]";
  const pct = Math.min(1, used / total);
  const barWidth = width - 2;
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

  return `{${color}-fg}[${"=".repeat(filled)}{/${color}-fg}{${theme.barEmpty}-fg}${".".repeat(empty)}{/${theme.barEmpty}-fg}{${color}-fg}]{/${color}-fg}`;
}
