export interface CleanOptions {
  dryRun: boolean;
  json: boolean;
}

export interface CleanResult {
  ok: boolean;
  paths: string[]; // paths cleaned
  freed: number; // bytes freed
  errors: string[]; // non-fatal errors
}
