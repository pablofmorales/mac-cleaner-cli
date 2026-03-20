export interface CleanOptions {
  dryRun: boolean;
  json: boolean;
  verbose: boolean;
  /** Skip sudo prompt and privileged paths entirely */
  noSudo?: boolean;
  /** Non-interactive mode (CI-safe) — same as --no-sudo */
  yes?: boolean;
}

export interface CleanResult {
  ok: boolean;
  paths: string[]; // paths cleaned
  freed: number; // bytes freed
  errors: string[]; // non-fatal errors
  privilegedSkipped?: number; // count of privileged paths skipped (for --json)
}
