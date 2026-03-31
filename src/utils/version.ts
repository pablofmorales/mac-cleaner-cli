import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

const PACKAGE_NAME = "@blackasteroid/mac-cleaner-cli";
const CACHE_DIR = path.join(os.homedir(), ".mac-cleaner");
const CACHE_FILE = path.join(CACHE_DIR, "last-version-check.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface VersionCache {
  checkedAt: number;
  latestVersion: string;
}

/**
 * Fetch the latest published version from npm registry.
 * Returns null on network error or timeout.
 */
export async function getLatestVersion(timeoutMs = 2500): Promise<string | null> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the cached latest version if fresh (< 24h), otherwise null.
 */
function getCachedVersion(): string | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const cache = JSON.parse(raw) as VersionCache;
    if (Date.now() - cache.checkedAt > CACHE_TTL_MS) return null;
    return cache.latestVersion;
  } catch {
    return null;
  }
}

/**
 * Writes a version check result to the cache file.
 */
function setCachedVersion(version: string): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const cache: VersionCache = { checkedAt: Date.now(), latestVersion: version };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf8");
  } catch {
    // Non-fatal: cache write failure should never crash the CLI
  }
}

/**
 * Returns the latest version from cache (if fresh) or npm registry.
 * Used for background startup check — won't block if network is slow.
 */
export async function getLatestVersionCached(timeoutMs = 2500): Promise<string | null> {
  const cached = getCachedVersion();
  if (cached) return cached;

  const latest = await getLatestVersion(timeoutMs);
  if (latest) setCachedVersion(latest);
  return latest;
}

/**
 * Compares two semver strings. Returns true if `latest` is newer than `current`.
 */
export function isNewer(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [cMaj, cMin, cPatch] = parse(current);
  const [lMaj, lMin, lPatch] = parse(latest);

  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPatch > cPatch;
}

// Security fix (Gerard HIGH): validate version string before passing to spawnSync.
// Prevents a compromised npm registry response from injecting arbitrary strings
// into the npm install argument (e.g. path traversal or special chars).
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9._-]+)?(?:\+[a-zA-Z0-9._-]+)?$/;

/**
 * Perform a live upgrade by running npm install -g @blackasteroid/mac-cleaner-cli@<version>.
 * Returns { ok, error }.
 */
export function runNpmUpgrade(targetVersion: string): { ok: boolean; error?: string } {
  if (!SEMVER_RE.test(targetVersion)) {
    return { ok: false, error: `Invalid version string from registry: "${targetVersion}"` };
  }

  const result = spawnSync(
    "npm",
    ["install", "-g", `${PACKAGE_NAME}@${targetVersion}`],
    { encoding: "utf8", timeout: 120_000 }
  );

  if (result.status !== 0) {
    return { ok: false, error: result.stderr?.trim() || "npm install failed" };
  }
  return { ok: true };
}
