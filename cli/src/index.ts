import {Command} from "commander";
import {initCommand} from "./commands/init";
import {registerDbModule} from "./modules/db/index";
import {registerAuthModule} from "./modules/auth/index";
import {logger} from "./common/logger";

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
  .version("1.0.0");

// Global options
program
  .option("-v, --verbose", "Enable verbose output")
  .option("--dry-run", "Show what would be done without making changes");

// Register init command
program
  .command("init")
  .description("Initialize a new Postkit project")
  .option("-f, --force", "Skip confirmation prompt")
  .action(async (cmdOptions) => {
    const options = {...program.opts(), ...cmdOptions};
    await initCommand(options);
  });

// Register modules
registerDbModule(program);
registerAuthModule(program);

// Parse and run
program.parse();
