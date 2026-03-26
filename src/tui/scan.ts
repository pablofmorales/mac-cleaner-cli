import type { CleanOptions, CleanResult } from "../types.js";

export interface ModuleScanResult {
  name: string;
  key: string;
  freed: number;
  paths: string[];
  errors: string[];
  ok: boolean;
}

interface ModuleDef {
  name: string;
  key: string;
  importPath: string;
}

const modules: ModuleDef[] = [
  { name: "System",   key: "system",   importPath: "../cleaners/system.js" },
  { name: "Brew",     key: "brew",     importPath: "../cleaners/brew.js" },
  { name: "Node",     key: "node",     importPath: "../cleaners/node.js" },
  { name: "Browser",  key: "browser",  importPath: "../cleaners/browser.js" },
  { name: "Docker",   key: "docker",   importPath: "../cleaners/docker.js" },
  { name: "Xcode",    key: "xcode",    importPath: "../cleaners/xcode.js" },
  { name: "Keychain", key: "keychain", importPath: "../cleaners/keychain.js" },
  { name: "Privacy",  key: "privacy",  importPath: "../cleaners/privacy.js" },
  { name: "Mail",     key: "mail",     importPath: "../cleaners/mail.js" },
];

export function getModuleList(): ModuleDef[] {
  return [...modules];
}

/**
 * Runs all cleaners in dry-run + json mode to get reclaimable space
 * without deleting anything. Suppresses all stdout.
 */
export async function scanAll(
  onProgress?: (moduleName: string) => void,
): Promise<ModuleScanResult[]> {
  const scanOpts: CleanOptions & { _suppressTable?: boolean } = {
    dryRun: true,
    json: true,
    verbose: false,
    noSudo: true,
    yes: true,
    _suppressTable: true,
  };

  const results: ModuleScanResult[] = [];

  // Suppress console.log during scan to prevent stdout pollution
  const origLog = console.log;
  const origWarn = console.warn;

  for (const mod of modules) {
    onProgress?.(mod.name);
    try {
      console.log = () => {};
      console.warn = () => {};
      const cleaner = await import(mod.importPath) as { clean: (opts: CleanOptions) => Promise<CleanResult> };
      const result = await cleaner.clean(scanOpts);
      results.push({
        name: mod.name,
        key: mod.key,
        freed: result.freed,
        paths: result.paths,
        errors: result.errors,
        ok: result.ok,
      });
    } catch {
      results.push({
        name: mod.name,
        key: mod.key,
        freed: 0,
        paths: [],
        errors: [`Failed to scan ${mod.name}`],
        ok: false,
      });
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
  }

  return results;
}

/**
 * Runs specific cleaners (actual clean, not dry-run).
 */
export async function runClean(
  keys: string[],
  onProgress?: (moduleName: string, status: "start" | "done" | "error", result?: CleanResult) => void,
): Promise<ModuleScanResult[]> {
  const cleanOpts: CleanOptions & { _suppressTable?: boolean } = {
    dryRun: false,
    json: true,
    verbose: false,
    noSudo: true,
    yes: true,
    _suppressTable: true,
  };

  const results: ModuleScanResult[] = [];
  const selected = modules.filter((m) => keys.includes(m.key));

  const origLog = console.log;
  const origWarn = console.warn;

  for (const mod of selected) {
    onProgress?.(mod.name, "start");
    try {
      console.log = () => {};
      console.warn = () => {};
      const cleaner = await import(mod.importPath) as { clean: (opts: CleanOptions) => Promise<CleanResult> };
      const result = await cleaner.clean(cleanOpts);
      results.push({
        name: mod.name,
        key: mod.key,
        freed: result.freed,
        paths: result.paths,
        errors: result.errors,
        ok: result.ok,
      });
      onProgress?.(mod.name, "done", result);
    } catch {
      results.push({
        name: mod.name,
        key: mod.key,
        freed: 0,
        paths: [],
        errors: [`Failed to clean ${mod.name}`],
        ok: false,
      });
      onProgress?.(mod.name, "error");
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
  }

  return results;
}
