import ora from "ora";
import {logger} from "../../../common/logger";
import {promptInput} from "../../../common/prompt";
import {getSession, deleteSession} from "../utils/session";
import {getSessionMigrationsPath} from "../utils/db-config";
import {mergeSessionMigrations, deleteSessionMigrations} from "../services/dbmate";
import {deletePlanFile} from "../services/pgschema";
import {deleteGeneratedSchema} from "../services/schema-generator";
import {addCommittedMigration, getAllCommittedMigrations} from "../utils/committed";
import type {CommandOptions} from "../../../common/types";
import type {SessionState} from "../types/index";
import {PostkitError} from "../../../common/errors";

interface CommitOptions extends CommandOptions {
  message?: string;
}

export async function commitCommand(options: CommitOptions): Promise<void> {
  const spinner = ora();

  try {
    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      throw new PostkitError(
        "No active migration session.",
        'Run "postkit db start" to begin a new session.',
      );
    }

    if (!session.pendingChanges.applied) {
      throw new PostkitError(
        "Changes have not been applied to local database yet.",
        'Run "postkit db apply" first to test changes locally.',
      );
    }

    const migrationFiles = session.pendingChanges.migrationFiles || [];
    if (migrationFiles.length === 0) {
      throw new PostkitError(
        "No migration files found in session.",
        'Run "postkit db apply" to create a migration file.',
      );
    }

    const sessionMigrationsDir = getSessionMigrationsPath();

    logger.heading("Commit Migration");
    logger.blank();
    logger.info(`Migrations to commit (${migrationFiles.length} file(s)):`);
    for (const mf of migrationFiles) {
      logger.info(`  - ${mf.name}`);
    }
    logger.blank();

    // Show any existing committed migrations
    const existingCommitted = await getAllCommittedMigrations();
    if (existingCommitted.length > 0) {
      logger.warn(`Note: There are ${existingCommitted.length} existing committed migration(s):`);
      for (const cm of existingCommitted) {
        logger.warn(`  - ${cm.migrationFile.name}`);
      }
      logger.blank();
    }

    // Prompt for commit message (required)
    // Use --message flag if provided, otherwise prompt
    const description = options.message
      ? options.message.trim()
      : await promptInput("Commit message (e.g. add_users_table):", {
          required: true,
          force: options.force,
        });

    // Step 1: Merge session migrations
    logger.step(1, 3, "Merging session migrations...");
    spinner.start("Creating merged migration file...");

    const mergedMigration = await mergeSessionMigrations(
      sessionMigrationsDir,
      description,
    );

    spinner.succeed(`Merged migration created: ${mergedMigration.name}`);
    logger.info(`Path: ${mergedMigration.path}`);

    // Step 2: Track in committed state
    logger.step(2, 3, "Tracking in committed state...");
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
    });

    spinner.succeed("Committed migration tracked");

    // Step 3: Cleanup session files
    logger.step(3, 3, "Cleaning up session files...");
    spinner.start("Removing session files...");

    await deleteSessionMigrations(sessionMigrationsDir);
    await deletePlanFile();
    await deleteGeneratedSchema();
    await deleteSession();

    spinner.succeed("Session files cleaned up");

    // Final summary
    logger.blank();
    logger.success("Migration committed successfully!");
    logger.blank();
    logger.info(`Committed migration: ${mergedMigration.name}`);
    logger.info(`Description: ${description}`);
    logger.info(`Merged from: ${migrationFiles.length} session migration(s)`);
    logger.blank();

    const allCommitted = await getAllCommittedMigrations();
    if (allCommitted.length > 0) {
      logger.info(`You have ${allCommitted.length} committed migration(s):`);
      for (const cm of allCommitted) {
        logger.info(`  - ${cm.migrationFile.name}`);
      }
      logger.blank();
    }

    logger.info("Next steps:");
    logger.info('  - Run "postkit db deploy" to deploy committed migrations');
    logger.info('  - Run "postkit db deploy --remote <name>" to deploy to specific remote');
    logger.info('  - Run "postkit db start" to begin a new session for more changes');
  } catch (error) {
    spinner.fail("Failed to commit migration");
    throw error;
  }
}
