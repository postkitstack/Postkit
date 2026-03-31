import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {getSession, deleteSession} from "../utils/session";
import {deletePlanFile} from "../services/pgschema";
import {deleteGeneratedSchema} from "../services/schema-generator";
import {deleteMigrationFile} from "../services/dbmate";
import {dropDatabase, parseConnectionUrl} from "../services/database";
import type {CommandOptions} from "../../../common/types";

export async function abortCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      logger.info("No active migration session to abort.");
      return;
    }

    logger.heading("Abort Migration Session");

    // Show session info
    logger.info("Current session:");
    logger.info(`  Started: ${session.startedAt}`);
    logger.info(`  Snapshot: ${session.remoteSnapshot}`);
    logger.info(
      `  Plan generated: ${session.pendingChanges.planned ? "Yes" : "No"}`,
    );
    logger.info(
      `  Applied to local: ${session.pendingChanges.applied ? "Yes" : "No"}`,
    );
    logger.info(
      `  Session migrations: ${session.pendingChanges.migrationFiles.length}`,
    );

    logger.blank();

    // Confirm unless force flag
    if (!options.force && !options.dryRun) {
      const {confirm} = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message:
            "Are you sure you want to abort this session? All changes will be lost.",
          default: false,
        },
      ]);

      if (!confirm) {
        logger.info("Abort cancelled.");
        return;
      }
    }

    // Step 1: Delete plan file
    logger.step(1, 5, "Removing plan file...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping file removal");
    } else {
      await deletePlanFile();
      spinner.succeed("Plan file removed");
    }

    // Step 2: Clean up orphaned migration file (session migrations only)
    logger.step(2, 5, "Checking for session migration files...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping migration file cleanup");
    } else {
      // Note: We don't delete committed migrations - they persist for deployment
      const sessionMigrations = session.pendingChanges.migrationFiles || [];
      if (sessionMigrations.length > 0) {
        spinner.info(`Found ${sessionMigrations.length} session migration file(s) - will be cleaned up`);
      } else {
        spinner.info("No session migration files found");
      }
    }

    // Step 3: Delete generated schema
    logger.step(3, 5, "Removing generated schema...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping file removal");
    } else {
      await deleteGeneratedSchema();
      spinner.succeed("Generated schema removed");
    }

    // Step 4: Drop local clone database
    logger.step(4, 5, "Dropping local clone database...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping database drop");
    } else {
      try {
        const localInfo = parseConnectionUrl(session.localDbUrl);
        spinner.start(`Dropping database: ${localInfo.database}...`);
        await dropDatabase(session.localDbUrl);
        spinner.succeed("Local clone database dropped");
      } catch (error) {
        spinner.warn("Could not drop local database (may already be removed)");
        logger.debug(
          error instanceof Error ? error.message : String(error),
          options.verbose,
        );
      }
    }

    // Step 5: Delete session file
    logger.step(5, 5, "Removing session file...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping session removal");
    } else {
      await deleteSession();
      spinner.succeed("Session file removed");
    }

    logger.blank();
    logger.success("Migration session aborted.");
    logger.blank();
    logger.info("All local changes have been discarded.");
    logger.info("Note: Committed migrations are preserved for deployment.");
    logger.info('Run "postkit db deploy --target=<env>" to deploy committed migrations.');
    logger.info('Run "postkit db start" to begin a new session.');
  } catch (error) {
    spinner.fail("Failed to abort session");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
