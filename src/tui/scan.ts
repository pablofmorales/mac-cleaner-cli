import { Worker } from "worker_threads";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import type { CleanOptions, CleanResult } from "../types.js";

const workerScript = `
import { parentPort, workerData } from "worker_threads";
console.log = () => {};
console.warn = () => {};
async function run() {
  try {
    const cleaner = await import(workerData.importPath);
    const result = await cleaner.clean(workerData.options);
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String(err) });
  }
}
run();
`;

/**
 * Resolve a relative import path (e.g. "../cleaners/system.js") to an
 * absolute file:// URL that works in both dev (tsx, .ts files) and
 * production (tsup-bundled, .js files).
 */
function resolveCleanerUrl(relativeImport: string): string {
  // First try: resolve as-is (.js) relative to this file
  const jsUrl = new URL(relativeImport, import.meta.url);
  const jsPath = fileURLToPath(jsUrl);
  if (existsSync(jsPath)) return jsUrl.href;

  // Second try: swap .js -> .ts for dev mode (tsx)
  const tsUrl = new URL(relativeImport.replace(/\.js$/, ".ts"), import.meta.url);
  const tsPath = fileURLToPath(tsUrl);
  if (existsSync(tsPath)) return tsUrl.href;

  // Fallback: return the .js URL and let the worker report the error
  return jsUrl.href;
}

/**
 * Runs a cleaner in a Worker thread so the main event loop stays free
 * for UI updates (spinner animation, screen redraws).
 */
function runInWorker(importPath: string, options: Record<string, unknown>): Promise<CleanResult> {
  return new Promise((resolve) => {
    const absPath = resolveCleanerUrl(importPath);

    const worker = new Worker(workerScript, {
      eval: true,
      workerData: { importPath: absPath, options },
    });

    let resolved = false;

    worker.on("message", (msg: { ok: boolean; result?: CleanResult; error?: string }) => {
      if (resolved) return;
      resolved = true;
      if (msg.ok && msg.result) {
        resolve(msg.result);
      } else {
        resolve({ ok: false, paths: [], freed: 0, errors: [msg.error ?? "Worker failed"] });
      }
    });

    worker.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      resolve({ ok: false, paths: [], freed: 0, errors: [String(err)] });
    });

    worker.on("exit", (code) => {
      if (resolved) return;
      resolved = true;
      if (code !== 0) {
        resolve({ ok: false, paths: [], freed: 0, errors: [`Worker exited with code ${code}`] });
      }
    });
  });
}

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
  { name: "Privacy",    key: "privacy",    importPath: "../cleaners/privacy.js" },
  { name: "iOS Backups", key: "mobile",  importPath: "../cleaners/mobile.js" },
  { name: "Maintain",  key: "maintain",  importPath: "../cleaners/maintain.js" },
  { name: "Large Files", key: "largefiles", importPath: "../cleaners/largefiles.js" },
  { name: "Startup",   key: "startup",   importPath: "../cleaners/startup.js" },
  { name: "Cloud",     key: "cloud",     importPath: "../cleaners/cloud.js" },
  { name: "Duplicates", key: "duplicates", importPath: "../cleaners/duplicates.js" },
  { name: "Mail",      key: "mail",      importPath: "../cleaners/mail.js" },
  { name: "Apps",      key: "apps",      importPath: "../cleaners/apps.js" },
];

export function getModuleList(): ModuleDef[] {
  return [...modules];
}

/**
 * Runs all cleaners in dry-run + json mode to get reclaimable space
 * without deleting anything. Each cleaner runs in a Worker thread
 * so the main event loop stays free for UI updates.
 */
export async function scanAll(
  onProgress?: (moduleName: string) => void,
): Promise<ModuleScanResult[]> {
  const scanOpts: Record<string, unknown> = {
    dryRun: true,
    json: true,
    verbose: false,
    noSudo: true,
    yes: true,
    _suppressTable: true,
  };

  const results: ModuleScanResult[] = [];

  for (const mod of modules) {
    onProgress?.(mod.name);
    try {
      const result = await runInWorker(mod.importPath, scanOpts);
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
    }
  }

  return results;
}

/**
 * Runs specific cleaners (actual clean, not dry-run).
 * Each cleaner runs in a Worker thread.
 */
export async function runClean(
  keys: string[],
  onProgress?: (moduleName: string, status: "start" | "done" | "error", result?: CleanResult) => void,
): Promise<ModuleScanResult[]> {
  const cleanOpts: Record<string, unknown> = {
    dryRun: false,
    json: true,
    verbose: false,
    noSudo: true,
    yes: true,
    _suppressTable: true,
  };

  const results: ModuleScanResult[] = [];
  const selected = modules.filter((m) => keys.includes(m.key));

  for (const mod of selected) {
    onProgress?.(mod.name, "start");
    try {
      const result = await runInWorker(mod.importPath, cleanOpts);
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
    }
  }

  return results;
}
