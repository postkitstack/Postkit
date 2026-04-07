import ora from "ora";
import {logger} from "../../../common/logger";
import {promptConfirm} from "../../../common/prompt";
import {getSession, deleteSession} from "../utils/session";
import {getSessionMigrationsPath} from "../utils/db-config";
import {deletePlanFile} from "../services/pgschema";
import {deleteGeneratedSchema} from "../services/schema-generator";
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
    logger.info(`  Remote: ${session.remoteName || "unknown"}`);
    logger.info(`  Cloned at: ${session.clonedAt}`);
    logger.info(
      `  Plan generated: ${session.pendingChanges.planned ? "Yes" : "No"}`,
    );
    logger.info(
      `  Applied to local: ${session.pendingChanges.applied ? "Yes" : "No"}`,
    );

    logger.blank();

    // Confirm unless force flag
    if (!options.dryRun) {
      const confirmed = await promptConfirm(
        "Are you sure you want to abort this session? All changes will be lost.",
        {default: false, force: options.force},
      );

      if (!confirmed) {
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

    // Step 2: Delete generated schema
    logger.step(2, 5, "Removing generated schema...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping file removal");
    } else {
      await deleteGeneratedSchema();
      spinner.succeed("Generated schema removed");
    }

    // Step 3: Drop local clone database
    logger.step(3, 5, "Dropping local clone database...");

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

    // Step 4: Delete session migrations folder
    logger.step(4, 5, "Removing session migrations folder...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping folder removal");
    } else {
      const sessionMigrationsDir = getSessionMigrationsPath();
      const fs = await import("fs/promises");
      const {existsSync} = await import("fs");

      if (existsSync(sessionMigrationsDir)) {
        await fs.rm(sessionMigrationsDir, {recursive: true, force: true});
        spinner.succeed("Session migrations folder removed");
      } else {
        spinner.info("No session migrations folder found");
      }
    }

    // Step 5: Delete session state
    logger.step(5, 5, "Removing session state...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping session removal");
    } else {
      await deleteSession();
      spinner.succeed("Session state removed");
    }

    logger.blank();
    logger.success("Migration session aborted.");
    logger.blank();
    logger.info("Cleaned up:");
    logger.info("  - Plan file removed");
    logger.info("  - Generated schema removed");
    logger.info("  - Local clone database dropped");
    logger.info("  - Session migrations folder removed");
    logger.info("  - Session state removed");
    logger.blank();
    logger.info("Preserved:");
    logger.info("  - Committed migrations (.postkit/db/migrations/)");
    logger.blank();
    logger.info("Next steps:");
    logger.info('  - Run "postkit db start" to begin a new session');
    logger.info('  - Run "postkit db deploy" to deploy committed migrations');
  } catch (error) {
    spinner.fail("Failed to abort session");
    throw error;
  }
}
