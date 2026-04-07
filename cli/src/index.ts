import {Command} from "commander";
import {createRequire} from "module";
import {initCommand} from "./commands/init";
import {registerDbModule} from "./modules/db/index";
import {registerAuthModule} from "./modules/auth/index";
import {logger} from "./common/logger";

const require = createRequire(import.meta.url);
const {version} = require("../package.json") as {version: string};

// Catch any async error that escapes a command's try/catch.
// Without this, Node prints a raw stack trace or silently fails.
process.on("unhandledRejection", (reason) => {
  logger.error(`Unexpected error: ${String(reason)}`);
  process.exit(1);
});

const program = new Command();

program
  .name("postkit")
  .description("PostKit - Developer toolkit for database management and more")
  .version(version);

// Global options
program
  .option("-v, --verbose", "Enable verbose output")
  .option("--dry-run", "Show what would be done without making changes")
  .option("--json", "Output results as JSON (for scripting and CI)");

// Register init command
program
  .command("init")
  .description("Initialize a new Postkit project")
  .option("-f, --force", "Skip confirmation prompts")
  .action(async (cmdOptions) => {
    const options = {...program.opts(), ...cmdOptions};
    await initCommand(options);
  });

// Register modules
registerDbModule(program);
registerAuthModule(program);

// Parse and run
program.parse();
