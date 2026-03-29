import { Worker } from "worker_threads";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import type { CleanOptions, CleanResult } from "../types.js";

// Detect dev mode: .ts source files exist alongside this module
const isDev = existsSync(fileURLToPath(new URL("../cleaners/system.ts", import.meta.url)));

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
 * Runs a cleaner in a Worker thread (production only).
 * In production, all files are bundled .js so resolution works.
 */
function runInWorker(importPath: string, options: Record<string, unknown>): Promise<CleanResult> {
  return new Promise((resolve) => {
    const absPath = new URL(importPath, import.meta.url).href;

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

/**
 * Runs a cleaner directly on the main thread (dev mode only).
 * The spinner will freeze during spawnSync calls, but all module
 * resolution works correctly under tsx.
 */
async function runDirect(importPath: string, options: Record<string, unknown>): Promise<CleanResult> {
  const origLog = console.log;
  const origWarn = console.warn;
  try {
    console.log = () => {};
    console.warn = () => {};
    const cleaner = await import(importPath) as { clean: (opts: any) => Promise<CleanResult> };
    return await cleaner.clean(options);
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
}

/**
 * Runs a cleaner module. Uses Worker threads in production (non-blocking
 * spinner) and direct imports in dev mode (correct tsx resolution).
 */
function runModule(importPath: string, options: Record<string, unknown>): Promise<CleanResult> {
  if (isDev) {
    return runDirect(importPath, options);
  }
  return runInWorker(importPath, options);
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
  group: string;
}

const modules: ModuleDef[] = [
  // Cleanup
  { name: "System",      key: "system",     importPath: "../cleaners/system.js",     group: "cleanup" },
  { name: "Brew",        key: "brew",       importPath: "../cleaners/brew.js",       group: "cleanup" },
  { name: "Node",        key: "node",       importPath: "../cleaners/node.js",       group: "cleanup" },
  { name: "Browser",     key: "browser",    importPath: "../cleaners/browser.js",    group: "cleanup" },
  { name: "Docker",      key: "docker",     importPath: "../cleaners/docker.js",     group: "cleanup" },
  { name: "Xcode",       key: "xcode",      importPath: "../cleaners/xcode.js",      group: "cleanup" },
  { name: "Cloud",       key: "cloud",      importPath: "../cleaners/cloud.js",      group: "cleanup" },
  { name: "Mail",        key: "mail",       importPath: "../cleaners/mail.js",       group: "cleanup" },
  { name: "iOS Backups", key: "mobile",     importPath: "../cleaners/mobile.js",     group: "cleanup" },
  // Protection
  { name: "Privacy",     key: "privacy",    importPath: "../cleaners/privacy.js",    group: "protection" },
  { name: "Keychain",    key: "keychain",   importPath: "../cleaners/keychain.js",   group: "protection" },
  // Speed
  { name: "Maintain",    key: "maintain",   importPath: "../cleaners/maintain.js",   group: "speed" },
  { name: "Startup",     key: "startup",    importPath: "../cleaners/startup.js",    group: "speed" },
  // Applications
  { name: "Apps",        key: "apps",       importPath: "../cleaners/apps.js",       group: "applications" },
  // Files
  { name: "Large Files", key: "largefiles", importPath: "../cleaners/largefiles.js", group: "files" },
  { name: "Duplicates",  key: "duplicates", importPath: "../cleaners/duplicates.js", group: "files" },
];

export function getModuleList(): ModuleDef[] {
  return [...modules];
}

/**
 * Runs all cleaners in dry-run + json mode to get reclaimable space
 * without deleting anything.
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
      const result = await runModule(mod.importPath, scanOpts);
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
      const result = await runModule(mod.importPath, cleanOpts);
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
