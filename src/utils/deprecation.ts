import chalk from "chalk";

export function emitDeprecation(oldCmd: string, newCmd: string): void {
  if (process.env.MAC_CLEANER_NO_DEPRECATION) return;
  process.stderr.write(
    chalk.yellow(`[!] "${oldCmd}" is deprecated, use "${newCmd}" instead\n`),
  );
}
