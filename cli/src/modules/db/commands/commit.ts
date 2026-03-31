import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {getSession, deleteSession} from "../utils/session";
import {getSessionMigrationsPath} from "../utils/db-config";
import {mergeSessionMigrations, deleteSessionMigrations} from "../services/dbmate";
import {deletePlanFile} from "../services/pgschema";
import {deleteGeneratedSchema} from "../services/schema-generator";
import {addCommittedMigration, getPendingCommittedMigrations} from "../utils/committed";
import type {CommandOptions} from "../../../common/types";
import type {SessionState} from "../types/index";

export async function commitCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      logger.error("No active migration session.");
      logger.info('Run "postkit db start" to begin a new session.');
      process.exit(1);
    }

    // Step 1: Validate session has applied changes
    if (!session.pendingChanges.applied) {
      logger.error("Changes have not been applied to local database yet.");
      logger.info('Run "postkit db apply" first to test changes locally.');
      process.exit(1);
    }

    // Check migration files exist in session
    const migrationFiles = session.pendingChanges.migrationFiles || [];
    if (migrationFiles.length === 0) {
      logger.error("No migration files found in session.");
      logger.info('Run "postkit db apply" to create a migration file.');
      process.exit(1);
    }

    const description = session.pendingChanges.description || "migration";
    const sessionMigrationsDir = getSessionMigrationsPath();

    logger.heading("Commit Migration");
    logger.blank();
    logger.info(`Migrations to commit (${migrationFiles.length} file(s)):`);
    for (const mf of migrationFiles) {
      logger.info(`  - ${mf.name}`);
    }
    logger.blank();

    // Show any existing pending committed migrations
    const existingCommitted = await getPendingCommittedMigrations();
    if (existingCommitted.length > 0) {
      logger.warn(`Note: There are ${existingCommitted.length} committed migration(s) pending deployment:`);
      for (const cm of existingCommitted) {
        logger.warn(`  - ${cm.migrationFile.name}`);
      }
      logger.blank();
    }

    // Confirm unless force flag
    if (!options.force) {
      const {confirm} = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Merge session migrations into a single committed migration?",
          default: false,
        },
      ]);

      if (!confirm) {
        logger.info("Commit cancelled.");
        return;
      }
    }

    // Step 2: Merge session migrations
    logger.step(1, 4, "Merging session migrations...");
    spinner.start("Creating merged migration file...");

    const mergedMigration = await mergeSessionMigrations(
      sessionMigrationsDir,
      description,
    );

    spinner.succeed(`Merged migration created: ${mergedMigration.name}`);
    logger.info(`Path: ${mergedMigration.path}`);

    // Step 3: Track in committed state
    logger.step(2, 4, "Tracking in committed state...");
    spinner.start("Saving committed migration record...");

    await addCommittedMigration({
      migrationFile: {
        name: mergedMigration.name,
        path: mergedMigration.path,
        timestamp: mergedMigration.timestamp,
      },
      description,
      sessionMigrations: migrationFiles,
      committedAt: new Date().toISOString(),
      deployed: false,
    });

    spinner.succeed("Committed migration tracked");

    // Step 4: Cleanup session files
    logger.step(3, 4, "Cleaning up session files...");
    spinner.start("Removing session files...");

    await deleteSessionMigrations(sessionMigrationsDir);
    await deletePlanFile();
    await deleteGeneratedSchema();
    await deleteSession();

    spinner.succeed("Session files cleaned up");

    // Final summary
    logger.step(4, 4, "Complete!");
    logger.blank();
    logger.success("Migration committed successfully!");
    logger.blank();
    logger.info(`Committed migration: ${mergedMigration.name}`);
    logger.info(`Description: ${description}`);
    logger.info(`Merged from: ${migrationFiles.length} session migration(s)`);
    logger.blank();

    const allPending = await getPendingCommittedMigrations();
    if (allPending.length > 0) {
      logger.info(`You have ${allPending.length} committed migration(s) pending deployment:`);
      for (const cm of allPending) {
        logger.info(`  - ${cm.migrationFile.name}`);
      }
      logger.blank();
      logger.info("Next steps:");
      logger.info('  - Run "postkit db deploy --target=<env>" to deploy committed migrations');
      logger.info('  - Run "postkit db start" to begin a new session for more changes');
    } else {
      logger.info("Next steps:");
      logger.info('  - Run "postkit db deploy --target=<env>" to deploy to target environment');
      logger.info('  - Run "postkit db start" to begin a new session for more changes');
    }
  } catch (error) {
    spinner.fail("Failed to commit migration");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
