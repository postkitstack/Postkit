import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {getSession, updatePendingChanges} from "../utils/session";
import {wrapPlanSQL, getPlanFileContent} from "../services/pgschema";
import {testConnection, executeSQL} from "../services/database";
import {applyInfra, generateInfra} from "../services/infra-generator";
import {applyGrants, generateGrants} from "../services/grant-generator";
import {applySeeds, generateSeeds} from "../services/seed-generator";
import type {CommandOptions} from "../../../common/types";

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
    logger.step(1, 7, "Loading plan...");
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
    logger.step(2, 7, "Testing local database connection...");
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

    // Apply infra (roles, schemas, extensions)
    logger.step(3, 7, "Applying infrastructure...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping infra");
    } else {
      const infra = await generateInfra();

      if (infra.length === 0) {
        spinner.info("No infra files found - skipping");
      } else {
        spinner.start("Applying infra...");
        await applyInfra(session.localDbUrl);
        spinner.succeed(`Infra applied (${infra.length} file(s))`);
      }
    }

    // Apply changes
    logger.step(4, 7, "Applying schema changes...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping apply");
    } else {
      spinner.start("Applying migration plan...");

      const wrappedSQL = await wrapPlanSQL(session.pendingChanges.planFile);

      if (!wrappedSQL) {
        spinner.succeed("No changes to apply");
      } else {
        try {
          const result = await executeSQL(session.localDbUrl, wrappedSQL);
          spinner.succeed("Changes applied successfully");
          logger.debug(result, options.verbose);
        } catch (error) {
          spinner.fail("Failed to apply changes");
          logger.error("Migration apply failed:");
          console.log(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    }

    // Apply grants
    logger.step(5, 7, "Applying grants...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping grants");
    } else {
      const grants = await generateGrants();

      if (grants.length === 0) {
        spinner.info("No grant files found - skipping");
      } else {
        spinner.start("Applying grants...");
        await applyGrants(session.localDbUrl);
        spinner.succeed(`Grants applied (${grants.length} file(s))`);
      }
    }

    // Apply seeds
    logger.step(6, 7, "Applying seeds...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping seeds");
    } else {
      const seeds = await generateSeeds();

      if (seeds.length === 0) {
        spinner.info("No seed files found - skipping");
      } else {
        spinner.start("Applying seed data...");
        await applySeeds(session.localDbUrl);
        spinner.succeed(`Seeds applied (${seeds.length} file(s))`);
      }
    }

    // Update session
    logger.step(7, 7, "Updating session state...");

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
