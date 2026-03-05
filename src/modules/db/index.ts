import {Command} from "commander";
import {startCommand} from "./commands/start";
import {planCommand} from "./commands/plan";
import {applyCommand} from "./commands/apply";
import {commitCommand} from "./commands/commit";
import {statusCommand} from "./commands/status";
import {abortCommand} from "./commands/abort";
import {grantsCommand} from "./commands/grants";

export function registerDbModule(program: Command): void {
  const db = program
    .command("db")
    .description("Database migration tools (session-based workflow)");

  // Start command
  db.command("start")
    .description("Clone remote database to local and start a migration session")
    .action(async () => {
      const options = program.opts();
      await startCommand(options);
    });

  // Plan command
  db.command("plan")
    .description("Generate schema diff (shows what will change)")
    .action(async () => {
      const options = program.opts();
      await planCommand(options);
    });

  // Apply command
  db.command("apply")
    .description("Apply schema changes to local cloned database")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await applyCommand(options);
    });

  // Commit command
  db.command("commit <description>")
    .description("Create migration file and apply to remote database")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (description, cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await commitCommand(description, options);
    });

  // Status command
  db.command("status")
    .description("Show current session state and pending changes")
    .action(async () => {
      const options = program.opts();
      await statusCommand(options);
    });

  // Abort command
  db.command("abort")
    .description("Cancel session and cleanup local clone")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await abortCommand(options);
    });

  // Grants command
  db.command("grants")
    .description("Regenerate and show grant statements")
    .option("--apply", "Apply grants to database")
    .option("--target <target>", "Target database: local or remote", "local")
    .action(async (cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await grantsCommand(options);
    });
}
