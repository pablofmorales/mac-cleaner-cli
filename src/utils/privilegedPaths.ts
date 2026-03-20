import * as os from "os";
import * as path from "path";

const home = os.homedir();

/**
 * Paths that require elevated privileges (sudo) to clean on macOS.
 * These are system-protected directories that produce EPERM/EACCES
 * when accessed by a regular user.
 */
export const PRIVILEGED_CACHE_PATHS: string[] = [
  // CloudKit and iCloud system caches
  path.join(home, "Library", "Caches", "CloudKit"),
  path.join(home, "Library", "Caches", "com.apple.iCloudHelper"),
  // HomeKit
  path.join(home, "Library", "Caches", "com.apple.HomeKit"),
  // Family sharing
  path.join(home, "Library", "Caches", "FamilyCircle"),
  // System log paths
  "/var/log",
  "/private/var/log",
  // Power log (requires root)
  "/tmp/powerlog",
  "/private/tmp/powerlog",
  // System diagnostic caches
  path.join(home, "Library", "Caches", "com.apple.security.KCDatabase"),
];

/**
 * Returns true if the given path is in the privileged list.
 */
export function isPrivilegedPath(targetPath: string): boolean {
  return PRIVILEGED_CACHE_PATHS.some(
    (p) => targetPath === p || targetPath.startsWith(p + path.sep)
  );
}
