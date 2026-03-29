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

  // -- Storage section --
  lines.push("");
  lines.push(`  {bold}STORAGE{/bold}`);
  lines.push("");
  lines.push(`  ${disk.name} (${disk.fs})`);
  const barWidth = Math.max(20, Math.min(50, ((mainBox as any).width as number || 60) - 30));
  lines.push(`  ${renderStorageBar(disk.used, disk.total, barWidth)}`);
  lines.push("");
  lines.push(`  {${theme.textDim}-fg}Free  ${formatBytes(disk.free)}     Total  ${formatBytes(disk.total)}{/${theme.textDim}-fg}`);
  lines.push("");

  // -- System info --
  lines.push(`  {bold}SYSTEM{/bold}`);
  lines.push("");
  lines.push(`  {${theme.textDim}-fg}OS{/${theme.textDim}-fg}       ${sys.osVersion}`);
  lines.push(`  {${theme.textDim}-fg}Uptime{/${theme.textDim}-fg}   ${sys.uptime}`);
  lines.push(`  {${theme.textDim}-fg}Node{/${theme.textDim}-fg}     ${sys.nodeVersion}`);
  lines.push("");

  // -- Reclaimable space --
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
