import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {getSession, updatePendingChanges} from "../utils/session";
import {getSessionMigrationsPath} from "../utils/db-config";
import {wrapPlanSQL, getPlanFileContent} from "../services/pgschema";
import {testConnection} from "../services/database";
import {createMigrationFile, runDbmateMigrate, deleteMigrationFile} from "../services/dbmate";
import {generateSchemaFingerprint} from "../services/schema-generator";
import {applyInfra, generateInfra} from "../services/infra-generator";
import {applyGrants, generateGrants} from "../services/grant-generator";
import {applySeeds, generateSeeds} from "../services/seed-generator";
import type {CommandOptions} from "../../../common/types";
import type {SessionState} from "../types/index";

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

    // Check if fully applied already
    if (session.pendingChanges.applied) {
      logger.warn("Changes have already been applied to the local database.");
      logger.info(
        'Run "postkit db commit" to apply migration to remote.',
      );
      logger.info('Or run "postkit db plan" again if you made more changes.');
      return;
    }

    // Resume from partial apply?
    if (session.pendingChanges.migrationApplied) {
      await handleResume(session, options, spinner);
      return;
    }

    // Fresh apply flow
    await handleFreshApply(session, options, spinner);
  } catch (error) {
    spinner.fail("Failed to apply migration");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function handleResume(
  session: SessionState,
  options: CommandOptions,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const pc = session.pendingChanges;
  const description = pc.description || "migration";

  logger.heading("Resuming Apply");
  logger.info("Migration was already applied. Resuming from where it left off...");
  logger.blank();

  let step = 1;
  const totalSteps = 3; // grants, seeds, update session

  // Grants
  if (!pc.grantsApplied) {
    logger.step(step, totalSteps, "Applying grants...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping grants");
    } else {
      try {
        const grants = await generateGrants();

        if (grants.length === 0) {
          spinner.info("No grant files found - skipping");
        } else {
          spinner.start("Applying grants...");
          await applyGrants(session.localDbUrl);
          spinner.succeed(`Grants applied (${grants.length} file(s))`);
        }
      } catch (error) {
        spinner.fail("Failed to apply grants");
        logger.error(error instanceof Error ? error.message : String(error));
        logger.blank();
        logger.warn("Grants failed. Migration is already applied to local database.");
        logger.info('Run "postkit db apply" again to retry from grants.');
        process.exit(1);
      }

      await updatePendingChanges({grantsApplied: true});
    }
  } else {
    logger.step(step, totalSteps, "Grants already applied - skipping");
  }

  step++;

  // Seeds
  if (!pc.seedsApplied) {
    logger.step(step, totalSteps, "Applying seeds...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping seeds");
    } else {
      try {
        const seeds = await generateSeeds();

        if (seeds.length === 0) {
          spinner.info("No seed files found - skipping");
        } else {
          spinner.start("Applying seed data...");
          await applySeeds(session.localDbUrl);
          spinner.succeed(`Seeds applied (${seeds.length} file(s))`);
        }
      } catch (error) {
        spinner.fail("Failed to apply seeds");
        logger.error(error instanceof Error ? error.message : String(error));
        await updatePendingChanges({seedsApplied: false});
        logger.blank();
        logger.warn("Seeds failed. Migration and grants are already applied.");
        logger.info('Run "postkit db apply" again to retry from seeds.');
        process.exit(1);
      }

      await updatePendingChanges({seedsApplied: true});
    }
  } else {
    logger.step(step, totalSteps, "Seeds already applied - skipping");
  }

  step++;

  // Mark fully applied
  logger.step(step, totalSteps, "Updating session state...");

  if (!options.dryRun) {
    await updatePendingChanges({applied: true});
  }

  const migrationFiles = pc.migrationFiles || [];
  const latestMigration = migrationFiles.length > 0
    ? migrationFiles[migrationFiles.length - 1].name
    : "unknown";

  logger.blank();
  logger.success("Migration applied to local database!");
  logger.blank();
  logger.info(`Migration: ${latestMigration}`);
  logger.info(`Description: ${description}`);
  logger.blank();
  logger.info("Next steps:");
  logger.info('  - Run "postkit db commit" to apply migration to remote');
}

async function handleFreshApply(
  session: SessionState,
  options: CommandOptions,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  // Validate schema fingerprint
  if (session.pendingChanges.schemaFingerprint) {
    const currentFingerprint = await generateSchemaFingerprint();

    if (currentFingerprint !== session.pendingChanges.schemaFingerprint) {
      logger.error("Schema files have changed since the plan was generated.");
      logger.info('Run "postkit db plan" again to regenerate the plan.');
      process.exit(1);
    }
  }

  logger.heading("Applying Migration to Local Database");

  // Step 1: Show the plan
  logger.step(1, 8, "Loading plan...");
  const planContent = await getPlanFileContent();

  if (planContent) {
    logger.info("Changes to be applied:");
    logger.blank();
    console.log(planContent);
    logger.blank();
  }

  // Ask for migration description
  let description: string;

  if (options.dryRun) {
    description = "dry_run";
  } else {
    const {desc} = await inquirer.prompt([
      {
        type: "input",
        name: "desc",
        message: "Migration description (e.g. add_users_table):",
        validate: (input: string) =>
          input.trim().length > 0 || "Description is required",
      },
    ]);
    description = desc.trim();
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

  // Step 2: Test local connection
  logger.step(2, 8, "Testing local database connection...");
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

  // Step 3: Apply infra (roles, schemas, extensions)
  logger.step(3, 8, "Applying infrastructure...");

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

  // Step 4: Create migration file in session migrations dir
  logger.step(4, 8, "Creating migration file...");

  const sessionMigrationsDir = getSessionMigrationsPath();
  let migrationFile;

  if (options.dryRun) {
    spinner.info("Dry run - skipping migration file creation");
    migrationFile = {
      name: `00000000000000_${description}.sql`,
      path: "/path/to/migration.sql",
      timestamp: "00000000000000",
    };
  } else {
    spinner.start("Wrapping plan and creating migration file...");

    const wrappedSQL = await wrapPlanSQL(session.pendingChanges.planFile!);

    if (!wrappedSQL) {
      spinner.succeed("No changes to apply");
      await updatePendingChanges({applied: true, description});
      logger.blank();
      logger.success("No schema changes to apply.");
      return;
    }

    migrationFile = await createMigrationFile(description, wrappedSQL, undefined, sessionMigrationsDir);
    spinner.succeed(`Migration file created: ${migrationFile.name}`);
    logger.info(`Path: ${migrationFile.path}`);
  }

  // Step 5: Apply migration via dbmate on local
  logger.step(5, 8, "Applying migration to local database...");

  if (options.dryRun) {
    spinner.info("Dry run - skipping apply");
  } else {
    spinner.start("Running dbmate migrate...");

    const migrateResult = await runDbmateMigrate(session.localDbUrl, sessionMigrationsDir);

    if (!migrateResult.success) {
      spinner.fail("Failed to apply migration");
      logger.error("Migration apply failed:");
      console.log(migrateResult.output);

      // Clean up the failed migration file
      await deleteMigrationFile(migrationFile.path);
      logger.info("Migration file has been cleaned up.");
      process.exit(1);
    }

    spinner.succeed("Migration applied to local database");

    if (migrateResult.output) {
      logger.debug(migrateResult.output, options.verbose);
    }

    // Save progress: migration applied
    const existingFiles = session.pendingChanges.migrationFiles || [];
    await updatePendingChanges({
      migrationApplied: true,
      migrationFiles: [...existingFiles, {name: migrationFile.name, path: migrationFile.path}],
      description,
    });
  }

  // Step 6: Apply grants
  logger.step(6, 8, "Applying grants...");

  if (options.dryRun) {
    spinner.info("Dry run - skipping grants");
  } else {
    try {
      const grants = await generateGrants();

      if (grants.length === 0) {
        spinner.info("No grant files found - skipping");
      } else {
        spinner.start("Applying grants...");
        await applyGrants(session.localDbUrl);
        spinner.succeed(`Grants applied (${grants.length} file(s))`);
      }
    } catch (error) {
      spinner.fail("Failed to apply grants");
      logger.error(error instanceof Error ? error.message : String(error));
      await updatePendingChanges({grantsApplied: false});
      logger.blank();
      logger.warn("Grants failed. Migration is already applied to local database.");
      logger.info('Run "postkit db apply" again to retry from grants.');
      process.exit(1);
    }

    await updatePendingChanges({grantsApplied: true});
  }

  // Step 7: Apply seeds
  logger.step(7, 8, "Applying seeds...");

  if (options.dryRun) {
    spinner.info("Dry run - skipping seeds");
  } else {
    try {
      const seeds = await generateSeeds();

      if (seeds.length === 0) {
        spinner.info("No seed files found - skipping");
      } else {
        spinner.start("Applying seed data...");
        await applySeeds(session.localDbUrl);
        spinner.succeed(`Seeds applied (${seeds.length} file(s))`);
      }
    } catch (error) {
      spinner.fail("Failed to apply seeds");
      logger.error(error instanceof Error ? error.message : String(error));
      await updatePendingChanges({seedsApplied: false});
      logger.blank();
      logger.warn("Seeds failed. Migration and grants are already applied.");
      logger.info('Run "postkit db apply" again to retry from seeds.');
      process.exit(1);
    }

    await updatePendingChanges({seedsApplied: true});
  }

  // Step 8: Mark fully applied
  logger.step(8, 8, "Updating session state...");

  if (!options.dryRun) {
    await updatePendingChanges({applied: true});
  }

  logger.blank();
  logger.success("Migration applied to local database!");
  logger.blank();
  logger.info(`Migration: ${migrationFile.name}`);
  logger.info(`Description: ${description}`);
  logger.blank();
  logger.info("Next steps:");
  logger.info("  - Verify the changes work correctly");
  logger.info(
    '  - Run "postkit db commit" to apply migration to remote',
  );
  logger.info(
    '  - Or run "postkit db plan" again if you need more changes',
  );
  logger.info(
    '  - Or run "postkit db abort" to cancel if something is wrong',
  );
}
