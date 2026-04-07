import ora from "ora";
import {logger} from "../../../common/logger";
import {promptInput} from "../../../common/prompt";
import {getSession, updatePendingChanges} from "../utils/session";
import {getSessionMigrationsPath} from "../utils/db-config";
import {createMigrationFile} from "../services/dbmate";
import {testConnection} from "../services/database";
import {getConfig} from "../utils/db-config";
import type {CommandOptions} from "../../../common/types";

interface MigrateOptions extends CommandOptions {
  name?: string;
}

// Template will be dynamically generated with the schema name
// Note: createMigrationFile() will add the -- migrate:up/down markers
function getMigrationTemplate(schema: string): string {
  return `-- Search path: ${schema}
SET search_path TO "${schema}";

-- Add your SQL migration here
-- Examples:

-- Create a table
-- CREATE TABLE example_table (
--   id SERIAL PRIMARY KEY,
--   name TEXT NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- Add a column
-- ALTER TABLE users ADD COLUMN email TEXT UNIQUE;

-- Create an index
-- CREATE INDEX idx_users_email ON users(email);
`;
}

export async function migrationCommand(options: MigrateOptions, name?: string): Promise<void> {
  const spinner = ora();

  try {
    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      logger.error("No active migration session.");
      logger.info('Run "postkit db start" to begin a new session.');
      process.exit(1);
    }

    // Get migration name
    let migrationName = name || options.name;

    if (!migrationName) {
      migrationName = await promptInput(
        "Migration name (e.g. add_users_table):",
        {required: true, force: options.force},
      );
    }

    // Ensure migrationName is defined (TypeScript safety)
    if (!migrationName) {
      logger.error("Migration name is required.");
      process.exit(1);
    }

    logger.heading("Create Manual Migration");
    logger.blank();
    logger.info(`Migration name: ${migrationName}`);
    logger.blank();

    // Test local connection
    logger.step(1, 3, "Testing local database connection...");
    spinner.start("Connecting to local database...");

    const localConnected = await testConnection(session.localDbUrl);

    if (!localConnected) {
      spinner.fail("Failed to connect to local database");
      logger.error("Could not connect to the local database.");
      logger.info(
        'The local clone may have been removed. Run "postkit db start" again.',
      );
      process.exit(1);
    }

    spinner.succeed("Connected to local database");

    // Create migration file
    logger.step(2, 3, "Creating migration file...");
    spinner.start("Creating migration file with template...");

    const config = getConfig();
    const sessionMigrationsDir = getSessionMigrationsPath();
    const template = getMigrationTemplate(config.schema);

    const migrationFile = await createMigrationFile(
      migrationName,
      template,
      undefined, // createMigrationFile will add default rollback message
      sessionMigrationsDir,
    );

    spinner.succeed(`Migration file created: ${migrationFile.name}`);
    logger.info(`Path: ${migrationFile.path}`);

    // Update session state (mark as planned, but DON'T track the file yet)
    // Files are only tracked after being successfully applied
    logger.step(3, 3, "Updating session state...");
    spinner.start("Updating session...");

    await updatePendingChanges({
      planned: true, // Mark as planned since we have a migration file
    });

    spinner.succeed("Session updated");

    logger.blank();
    logger.success("Manual migration created!");
    logger.blank();
    logger.info(`Migration: ${migrationFile.name}`);
    logger.info(`Path: ${migrationFile.path}`);
    logger.blank();

    // Open in editor if EDITOR is set
    const editor = process.env.EDITOR || process.env.VISUAL;
    if (editor) {
      logger.info(`Opening ${migrationFile.name} in ${editor}...`);

      try {
        const {spawn} = await import("child_process");
        // Use spawn to open editor (inherits stdio)
        spawn(editor, [migrationFile.path], {
          stdio: "inherit",
        });
      } catch (error) {
        logger.warn("Failed to open editor. You can edit the file manually.");
      }
    } else {
      logger.info("Edit the migration file manually to add your SQL.");
      logger.info("Set the EDITOR environment variable to auto-open in your editor.");
    }

    logger.blank();
    logger.info("Next steps:");
    logger.info("  - Edit the migration file to add your SQL");
    logger.info('  - Run "postkit db apply" to apply the migration to the local database');
    logger.info('  - Run "postkit db commit" to commit the migration');
    logger.info('  - Run "postkit db migration <name>" to create more migrations in this session');
  } catch (error) {
    spinner.fail("Failed to create migration");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
