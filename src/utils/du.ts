import { spawnSync } from "child_process";
import * as fs from "fs";

/**
 * Returns the size of a path in bytes using `du -sk`.
 * Returns 0 if path does not exist or du fails.
 */
export function duBytes(targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0;
  const result = spawnSync("du", ["-sk", targetPath], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return 0;
  const kb = parseInt(result.stdout.split("\t")[0], 10);
  if (isNaN(kb)) return 0;
  return kb * 1024;
}

/**
 * Returns the total size of multiple paths in bytes.
 */
export function duBytesMultiple(paths: string[]): number {
  return paths.reduce((total, p) => total + duBytes(p), 0);
}

/**
 * Formats bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = (bytes / Math.pow(1024, i)).toFixed(2);
  return `${value} ${units[i]}`;
}
