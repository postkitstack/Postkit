import {Command} from "commander";
import {startCommand} from "./commands/start";
import {planCommand} from "./commands/plan";
import {applyCommand} from "./commands/apply";
import {commitCommand} from "./commands/commit";
import {statusCommand} from "./commands/status";
import {abortCommand} from "./commands/abort";
import {migrateCommand} from "./commands/migrate";
import {infraCommand} from "./commands/infra";
import {grantsCommand} from "./commands/grants";
import {seedCommand} from "./commands/seed";
import {deployCommand} from "./commands/deploy";

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
  db.command("commit")
    .description("Merge session migrations into a single committed migration")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await commitCommand(options);
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

  // Migrate command
  db.command("migrate")
    .description("Create a manual SQL migration")
    .argument("[name]", "Migration name (e.g. add_users_table)")
    .option("-d, --description <desc>", "Migration description")
    .action(async (name, cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await migrateCommand(options, name);
    });

  // Infra command
  db.command("infra")
    .description("Show and apply infrastructure statements (roles, schemas, extensions)")
    .option("--apply", "Apply infra to database")
    .option("--target <target>", "Target database: local or remote", "local")
    .action(async (cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await infraCommand(options);
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

  // Seed command
  db.command("seed")
    .description("Show and apply seed data")
    .option("--apply", "Apply seeds to database")
    .option("--target <target>", "Target database: local or remote", "local")
    .action(async (cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await seedCommand(options);
    });

  // Deploy command
  db.command("deploy")
    .description("Deploy committed migrations (defaults to remote DB)")
    .option("--target <target>", "Target environment name (from config environments)")
    .option("--url <url>", "Direct database URL to deploy to")
    .option("-f, --force", "Skip confirmation prompts")
    .action(async (cmdOptions) => {
      const options = {...program.opts(), ...cmdOptions};
      await deployCommand(options);
    });
}
