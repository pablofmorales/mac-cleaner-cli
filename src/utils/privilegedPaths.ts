import * as path from "path";

/**
 * Paths that require elevated privileges (sudo) to clean on macOS.
 * These are system-protected directories that produce EPERM/EACCES
 * when accessed by a regular user.
 */
export const PRIVILEGED_CACHE_PATHS: string[] = [
  // System log paths (sudo actually works for these)
  "/var/log",
  "/private/var/log",
  // Power log (requires root)
  "/tmp/powerlog",
  "/private/tmp/powerlog",
];

/**
 * Returns true if the given path is in the privileged list.
 */
export function isPrivilegedPath(targetPath: string): boolean {
  return PRIVILEGED_CACHE_PATHS.some(
    (p) => targetPath === p || targetPath.startsWith(p + path.sep)
  );
}
