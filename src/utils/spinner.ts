import chalk from "chalk";
import ora, { Ora } from "ora";

/**
 * A minimal interface that both the real ora spinner and the text fallback
 * implement — so cleaners don't need to know which one they have.
 */
export interface Spinner {
  text: string;
  start(): this;
  succeed(msg?: string): this;
  fail(msg?: string): this;
  warn(msg?: string): this;
  info(msg?: string): this;
  stop(): this;
}

/**
 * Text-only fallback used when the terminal can't support ora animations.
 * Prints clean, static lines instead of animated spinners.
 */
class TextSpinner implements Spinner {
  public text: string;

  constructor(text: string) {
    this.text = text;
  }

  start(): this {
    process.stdout.write(`  ${chalk.gray("⟳")} ${this.text}\n`);
    return this;
  }

  succeed(msg?: string): this {
    process.stdout.write(`  ${chalk.green("✔")} ${msg ?? this.text}\n`);
    return this;
  }

  fail(msg?: string): this {
    process.stdout.write(`  ${chalk.red("✗")} ${msg ?? this.text}\n`);
    return this;
  }

  warn(msg?: string): this {
    process.stdout.write(`  ${chalk.yellow("⚠")} ${msg ?? this.text}\n`);
    return this;
  }

  info(msg?: string): this {
    process.stdout.write(`  ${chalk.blue("ℹ")} ${msg ?? this.text}\n`);
    return this;
  }

  stop(): this {
    return this;
  }
}

/**
 * Factory: returns a real ora spinner in TTY environments, or a simple
 * text fallback when running in CI, pipes, dumb terminals, or other
 * non-interactive contexts where ora's ANSI animation would not work.
 */
export function createSpinner(text: string): Spinner {
  const isTTY = process.stdout.isTTY === true;
  const isDumb = process.env.TERM === "dumb";
  const isCI = Boolean(process.env.CI);

  if (!isTTY || isDumb || isCI) {
    return new TextSpinner(text);
  }

  // Wrap ora to satisfy our interface
  const spinner: Ora = ora({ text, color: "cyan" }).start();
  return spinner as unknown as Spinner;
}
