import {Command} from "commander";
import {checkInitialized} from "../../common/config";
import {logger} from "../../common/logger";
import {startCommand} from "./commands/start";
import {planCommand} from "./commands/plan";
import {applyCommand} from "./commands/apply";
import {commitCommand} from "./commands/commit";
import {statusCommand} from "./commands/status";
import {abortCommand} from "./commands/abort";
import {migrationCommand} from "./commands/migration";
import {infraCommand} from "./commands/infra";
import {grantsCommand} from "./commands/grants";
import {seedCommand} from "./commands/seed";
import {deployCommand} from "./commands/deploy";
import {
  remoteListCommand,
  remoteAddCommand,
  remoteRemoveCommand,
  remoteUseCommand,
} from "./commands/remote";

/**
 * Wrapper to check initialization before running db commands
 */
async function withInitCheck(fn: () => Promise<void>): Promise<void> {
  try {
    checkInitialized();
    await fn();
  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    } else {
      logger.error(String(error));
    }
    process.exit(1);
  }
}

export function registerDbModule(program: Command): void {
  const db = program
    .command("db")
    .description("Database migration tools (session-based workflow)");

  // Start command
  db.command("start")
    .description("Clone remote database to local and start a migration session")
    .option("--remote <name>", "Use named remote database")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await startCommand(options);
      });
    });

  // Plan command
  db.command("plan")
    .description("Generate schema diff (shows what will change)")
    .action(async () => {
      await withInitCheck(async () => {
        const options = program.opts();
        await planCommand(options);
      });
    });

  // Apply command
  db.command("apply")
    .description("Apply schema changes to local cloned database")
    .action(async () => {
      await withInitCheck(async () => {
        const options = program.opts();
        await applyCommand(options);
      });
    });

  // Commit command
  db.command("commit")
    .description("Merge session migrations into a single committed migration")
    .action(async () => {
      await withInitCheck(async () => {
        const options = program.opts();
        await commitCommand(options);
      });
    });

  // Status command
  db.command("status")
    .description("Show current session state and pending changes")
    .action(async () => {
      await withInitCheck(async () => {
        const options = program.opts();
        await statusCommand(options);
      });
    });

  // Abort command
  db.command("abort")
    .description("Cancel session and cleanup local clone")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await abortCommand(options);
      });
    });

  // Migration command
  db.command("migration")
    .description("Create a manual SQL migration file")
    .argument("[name]", "Migration name (e.g. add_users_table)")
    .action(async (name, cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await migrationCommand(options, name);
      });
    });

  // Infra command
  db.command("infra")
    .description("Show and apply infrastructure statements (roles, schemas, extensions)")
    .option("--apply", "Apply infra to database")
    .option("--target <target>", "Target database: local or remote", "local")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await infraCommand(options);
      });
    });

  // Grants command
  db.command("grants")
    .description("Regenerate and show grant statements")
    .option("--apply", "Apply grants to database")
    .option("--target <target>", "Target database: local or remote", "local")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await grantsCommand(options);
      });
    });

  // Seed command
  db.command("seed")
    .description("Show and apply seed data")
    .option("--apply", "Apply seeds to database")
    .option("--target <target>", "Target database: local or remote", "local")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await seedCommand(options);
      });
    });

  // Deploy command
  db.command("deploy")
    .description("Deploy committed migrations (defaults to remote DB)")
    .option("--remote <name>", "Target remote name")
    .option("--url <url>", "Direct database URL to deploy to")
    .option("-f, --force", "Skip confirmation prompts")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await deployCommand(options);
      });
    });

  // Remote command group
  const remoteCmd = db.command("remote")
    .description("Manage named remote databases");

  remoteCmd.command("list")
    .description("List all configured remotes")
    .action(async () => {
      await withInitCheck(async () => {
        const options = program.opts();
        await remoteListCommand();
      });
    });

  remoteCmd.command("add")
    .description("Add a new remote database")
    .argument("<name>", "Remote name")
    .argument("<url>", "Database connection URL")
    .option("--default", "Set as default remote")
    .action(async (name, url, cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await remoteAddCommand(options, name, url);
      });
    });

  remoteCmd.command("remove")
    .description("Remove a remote database")
    .argument("<name>", "Remote name")
    .option("-f, --force", "Skip confirmation")
    .action(async (name, cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await remoteRemoveCommand(options, name);
      });
    });

  remoteCmd.command("use")
    .description("Set default remote")
    .argument("<name>", "Remote name")
    .action(async (name, cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await remoteUseCommand(options, name);
      });
    });
}
