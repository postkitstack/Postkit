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

    if (session.commitState) {
      logger.info(
        `  Commit in progress: Yes (remote applied: ${session.commitState.remoteApplied ? "Yes" : "No"})`,
      );
    }

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

    // Step 2: Clean up orphaned migration file
    logger.step(2, 5, "Checking for orphaned migration files...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping migration file cleanup");
    } else if (session.commitState?.migrationFile) {
      if (session.commitState.remoteApplied) {
        spinner.warn(
          `Migration "${session.commitState.migrationFile.name}" was already applied to remote - keeping file`,
        );
        logger.warn(
          "This migration has been applied to the remote database and cannot be undone by aborting.",
        );
        logger.info(
          "You may need to create a new migration to revert these changes.",
        );
      } else {
        const deleted = await deleteMigrationFile(
          session.commitState.migrationFile.path,
        );
        if (deleted) {
          spinner.succeed(
            `Orphaned migration file removed: ${session.commitState.migrationFile.name}`,
          );
        } else {
          spinner.info("Migration file already removed");
        }
      }
    } else {
      spinner.info("No orphaned migration files found");
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
    if (session.commitState?.remoteApplied) {
      logger.warn(
        "Note: The migration was already applied to the remote database.",
      );
      logger.info(
        "Create a new session to revert remote changes if needed.",
      );
    } else {
      logger.info('Run "postkit db start" to begin a new session.');
    }
  } catch (error) {
    spinner.fail("Failed to abort session");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
