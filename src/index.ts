import { Command } from "commander";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name("mac-cleaner")
  .description("🧹 Clean dev caches on macOS — npm, Homebrew, Docker, Xcode, browsers, and more")
  .version(pkg.version)
  .option("--dry-run", "Show what would be deleted without actually deleting")
  .option("--json", "Output results as JSON");

program
  .command("all")
  .description("Run all cleaners")
  .action(() => {
    console.log("mac-cleaner v" + pkg.version + " — scaffold ready, modules coming soon.");
  });

program.parse(process.argv);
