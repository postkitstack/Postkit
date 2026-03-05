import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger.js";
import {getSession, updatePendingChanges} from "../utils/session.js";
import {runPgschemaApply, getPlanFileContent} from "../services/pgschema.js";
import {testConnection} from "../services/database.js";
import type {CommandOptions} from "../../../common/types.js";

export async function applyCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      logger.error("No active migration session.");
      logger.info('Run "postkit db start" to begin a new session.');
      process.exit(1);
    }

    // Check if plan exists
    if (!session.pendingChanges.planned || !session.pendingChanges.planFile) {
      logger.error("No migration plan found.");
      logger.info('Run "postkit db plan" first to generate a plan.');
      process.exit(1);
    }

    // Check if already applied
    if (session.pendingChanges.applied) {
      logger.warn("Changes have already been applied to the local database.");
      logger.info(
        'Run "postkit db commit <description>" to create a migration file.',
      );
      logger.info('Or run "postkit db plan" again if you made more changes.');
      return;
    }

    logger.heading("Applying Migration to Local Database");

    // Show the plan
    logger.step(1, 4, "Loading plan...");
    const planContent = await getPlanFileContent();

    if (planContent) {
      logger.info("Changes to be applied:");
      logger.blank();
      console.log(planContent);
      logger.blank();
    }

    // Confirm unless force flag
    if (!options.force && !options.dryRun) {
      const {confirm} = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Apply these changes to the local database?",
          default: true,
        },
      ]);

      if (!confirm) {
        logger.info("Apply cancelled.");
        return;
      }
    }

    // Test local connection
    logger.step(2, 4, "Testing local database connection...");
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

    // Apply changes
    logger.step(3, 4, "Applying changes...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping apply");
    } else {
      spinner.start("Applying migration plan...");

      const applyResult = await runPgschemaApply(
        session.pendingChanges.planFile,
        session.localDbUrl,
      );

      if (!applyResult.success) {
        spinner.fail("Failed to apply changes");
        logger.error("Migration apply failed:");
        console.log(applyResult.output);
        process.exit(1);
      }

      spinner.succeed("Changes applied successfully");

      if (applyResult.output) {
        logger.debug(applyResult.output, options.verbose);
      }
    }

    // Update session
    logger.step(4, 4, "Updating session state...");

    if (!options.dryRun) {
      await updatePendingChanges({
        applied: true,
      });
    }

    logger.blank();
    logger.success("Migration applied to local database!");
    logger.blank();
    logger.info("The changes have been tested on your local clone.");
    logger.blank();
    logger.info("Next steps:");
    logger.info("  - Verify the changes work correctly");
    logger.info(
      '  - Run "postkit db commit <description>" to create migration and apply to remote',
    );
    logger.info(
      '  - Or run "postkit db abort" to cancel if something is wrong',
    );
  } catch (error) {
    spinner.fail("Failed to apply migration");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
