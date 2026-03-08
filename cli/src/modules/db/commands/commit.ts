import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {getSession, deleteSession, updateSession} from "../utils/session";
import {getPlanFileContent, deletePlanFile} from "../services/pgschema";
import {
  createMigrationFile,
  runDbmateMigrate,
  deleteMigrationFile,
} from "../services/dbmate";
import {deleteGeneratedSchema} from "../services/schema-generator";
import {testConnection} from "../services/database";
import {applyGrants, generateGrants} from "../services/grant-generator";
import {applySeeds, generateSeeds} from "../services/seed-generator";
import type {CommandOptions} from "../../../common/types";
import type {CommitState, SessionState} from "../types/index";

async function applyGrantsStep(
  remoteDbUrl: string,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const grants = await generateGrants();

  if (grants.length === 0) {
    spinner.info("No grant files found - skipping");
    return;
  }

  spinner.start("Applying grants to remote database...");
  await applyGrants(remoteDbUrl);
  spinner.succeed(`Grants applied to remote (${grants.length} file(s))`);
}

async function applySeedsStep(
  remoteDbUrl: string,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const seeds = await generateSeeds();

  if (seeds.length === 0) {
    spinner.info("No seed files found - skipping");
    return;
  }

  spinner.start("Applying seed data to remote database...");
  await applySeeds(remoteDbUrl);
  spinner.succeed(`Seeds applied to remote (${seeds.length} file(s))`);
}

async function cleanupStep(
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  await deletePlanFile();
  await deleteGeneratedSchema();
  await deleteSession();
  spinner.succeed("Session cleaned up");
}

async function clearCommitState(): Promise<void> {
  try {
    await updateSession({commitState: undefined});
  } catch {
    // Session may already be deleted during cleanup
  }
}

async function saveCommitState(
  commitState: CommitState,
): Promise<void> {
  await updateSession({commitState});
}

export async function commitCommand(
  description: string,
  options: CommandOptions,
): Promise<void> {
  const spinner = ora();

  try {
    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      logger.error("No active migration session.");
      logger.info('Run "postkit db start" to begin a new session.');
      process.exit(1);
    }

    // Check for resume from previous failed commit
    if (session.commitState) {
      await handleResume(session, options, spinner);
      return;
    }

    // Fresh commit flow
    await handleFreshCommit(session, description, options, spinner);
  } catch (error) {
    spinner.fail("Failed to commit migration");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function handleResume(
  session: SessionState,
  options: CommandOptions,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const commitState = session.commitState!;

  if (!commitState.remoteApplied) {
    // Migration was not applied to remote — clean up orphaned file and start fresh
    logger.info("Found incomplete commit state (migration not applied to remote).");
    logger.info("Cleaning up orphaned migration file and resetting...");

    if (commitState.migrationFile) {
      const deleted = await deleteMigrationFile(commitState.migrationFile.path);
      if (deleted) {
        spinner.succeed(`Deleted orphaned migration file: ${commitState.migrationFile.name}`);
      }
    }

    await clearCommitState();
    logger.info('Commit state cleared. Please run "postkit db commit" again to start fresh.');
    return;
  }

  // Migration was applied to remote — resume from grants/seeds
  logger.heading("Resuming Commit");
  logger.info(`Migration "${commitState.description}" was already applied to remote.`);
  logger.info("Resuming from where it left off...");
  logger.blank();

  const description = commitState.description;
  const migrationFile = commitState.migrationFile;

  // Step 5: Grants (if not already done)
  if (!commitState.grantsApplied) {
    logger.step(5, 7, "Applying grants to remote...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping grants");
    } else {
      try {
        await applyGrantsStep(session.remoteDbUrl, spinner);
      } catch (error) {
        spinner.fail("Failed to apply grants");
        logger.error(error instanceof Error ? error.message : String(error));
        await saveCommitState({
          ...commitState,
          grantsApplied: false,
        });
        logger.blank();
        logger.warn("Grants failed. The migration has already been applied to remote.");
        logger.info('Run "postkit db commit" again to retry from grants.');
        process.exit(1);
      }

      await saveCommitState({
        ...commitState,
        grantsApplied: true,
      });
    }
  } else {
    logger.step(5, 7, "Grants already applied - skipping");
  }

  // Step 6: Seeds (if not already done)
  if (!commitState.seedsApplied) {
    logger.step(6, 7, "Applying seeds to remote...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping seeds");
    } else {
      try {
        await applySeedsStep(session.remoteDbUrl, spinner);
      } catch (error) {
        spinner.fail("Failed to apply seeds");
        logger.error(error instanceof Error ? error.message : String(error));
        await saveCommitState({
          ...commitState,
          grantsApplied: true,
          seedsApplied: false,
        });
        logger.blank();
        logger.warn("Seeds failed. The migration and grants have already been applied.");
        logger.info('Run "postkit db commit" again to retry from seeds.');
        process.exit(1);
      }
    }
  } else {
    logger.step(6, 7, "Seeds already applied - skipping");
  }

  // Step 7: Cleanup
  logger.step(7, 7, "Cleaning up session...");

  if (!options.dryRun) {
    try {
      await cleanupStep(spinner);
    } catch (error) {
      logger.warn("Cleanup failed (non-fatal): " + (error instanceof Error ? error.message : String(error)));
      logger.info("The migration was committed successfully. You may need to manually clean up session files.");
    }
  }

  logger.blank();
  logger.success("Migration committed successfully!");
  logger.blank();
  if (migrationFile) {
    logger.info(`Migration: ${migrationFile.name}`);
  }
  logger.info(`Description: ${description}`);
  logger.blank();
  logger.info("The migration has been applied to the remote database.");
  logger.info('Run "postkit db start" to begin a new migration session.');
}

async function handleFreshCommit(
  session: SessionState,
  description: string,
  options: CommandOptions,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  // Validate description
  if (!description || description.trim().length === 0) {
    logger.error("Migration description is required.");
    logger.info('Usage: postkit db commit "description_of_changes"');
    process.exit(1);
  }

  // Check if plan exists
  if (!session.pendingChanges.planned || !session.pendingChanges.planFile) {
    logger.error("No migration plan found.");
    logger.info('Run "postkit db plan" first to generate a plan.');
    process.exit(1);
  }

  logger.heading("Committing Migration");

  // Step 1: Load plan
  logger.step(1, 7, "Loading plan...");
  const planContent = await getPlanFileContent();

  if (!planContent || planContent.trim().length === 0) {
    logger.error("Plan file is empty.");
    logger.info('Run "postkit db plan" to regenerate the plan.');
    process.exit(1);
  }

  logger.info("Changes to be committed:");
  logger.blank();
  console.log(planContent);
  logger.blank();

  // Confirm unless force flag
  if (!options.force && !options.dryRun) {
    const {confirm} = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Create migration file and apply to remote database?",
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info("Commit cancelled.");
      return;
    }
  }

  // Step 2: Create migration file
  logger.step(2, 7, "Creating migration file...");
  spinner.start("Writing migration file...");

  let migrationFile;

  if (options.dryRun) {
    spinner.info("Dry run - skipping file creation");
    migrationFile = {
      name: `00000000000000_${description}.sql`,
      path: "/path/to/migration.sql",
      timestamp: "00000000000000",
    };
  } else {
    migrationFile = await createMigrationFile(description, planContent);
    spinner.succeed(`Migration file created: ${migrationFile.name}`);
    logger.info(`Path: ${migrationFile.path}`);

    // Save initial commit state
    await saveCommitState({
      migrationFile: {name: migrationFile.name, path: migrationFile.path},
      remoteApplied: false,
      grantsApplied: false,
      seedsApplied: false,
      description,
    });
  }

  // Step 3: Test remote connection
  logger.step(3, 7, "Testing remote database connection...");
  spinner.start("Connecting to remote database...");

  const remoteConnected = await testConnection(session.remoteDbUrl);

  if (!remoteConnected) {
    spinner.fail("Failed to connect to remote database");
    logger.error("Could not connect to the remote database.");

    if (!options.dryRun) {
      // Delete orphaned migration file since it was never applied
      await deleteMigrationFile(migrationFile.path);
      await clearCommitState();
      logger.info("Migration file has been cleaned up.");
    }

    logger.info("Fix the connection and retry with: postkit db commit");
    process.exit(1);
  }

  spinner.succeed("Connected to remote database");

  // Step 4: Apply migration to remote
  logger.step(4, 7, "Applying migration to remote database...");

  if (options.dryRun) {
    spinner.info("Dry run - skipping remote apply");
  } else {
    spinner.start("Running dbmate migrate...");

    const migrateResult = await runDbmateMigrate(session.remoteDbUrl);

    if (!migrateResult.success) {
      spinner.fail("Failed to apply migration");
      logger.error("Migration failed on remote database:");
      console.log(migrateResult.output);

      // Delete orphaned migration file since dbmate failed to apply it
      await deleteMigrationFile(migrationFile.path);
      await clearCommitState();
      logger.info("Migration file has been cleaned up.");
      logger.info("Fix the issue and retry with: postkit db commit");
      process.exit(1);
    }

    spinner.succeed("Migration applied to remote database");

    if (migrateResult.output) {
      logger.debug(migrateResult.output, options.verbose);
    }

    // Mark remote as applied — from here, migration file must stay
    await saveCommitState({
      migrationFile: {name: migrationFile.name, path: migrationFile.path},
      remoteApplied: true,
      grantsApplied: false,
      seedsApplied: false,
      description,
    });
  }

  // Step 5: Apply grants to remote
  logger.step(5, 7, "Applying grants to remote...");

  if (options.dryRun) {
    spinner.info("Dry run - skipping grants");
  } else {
    try {
      await applyGrantsStep(session.remoteDbUrl, spinner);
    } catch (error) {
      spinner.fail("Failed to apply grants");
      logger.error(error instanceof Error ? error.message : String(error));
      await saveCommitState({
        migrationFile: {name: migrationFile.name, path: migrationFile.path},
        remoteApplied: true,
        grantsApplied: false,
        seedsApplied: false,
        description,
      });
      logger.blank();
      logger.warn("Grants failed. The migration has already been applied to remote.");
      logger.info('Run "postkit db commit" again to retry from grants.');
      process.exit(1);
    }

    await saveCommitState({
      migrationFile: {name: migrationFile.name, path: migrationFile.path},
      remoteApplied: true,
      grantsApplied: true,
      seedsApplied: false,
      description,
    });
  }

  // Step 6: Apply seeds to remote
  logger.step(6, 7, "Applying seeds to remote...");

  if (options.dryRun) {
    spinner.info("Dry run - skipping seeds");
  } else {
    try {
      await applySeedsStep(session.remoteDbUrl, spinner);
    } catch (error) {
      spinner.fail("Failed to apply seeds");
      logger.error(error instanceof Error ? error.message : String(error));
      await saveCommitState({
        migrationFile: {name: migrationFile.name, path: migrationFile.path},
        remoteApplied: true,
        grantsApplied: true,
        seedsApplied: false,
        description,
      });
      logger.blank();
      logger.warn("Seeds failed. The migration and grants have already been applied.");
      logger.info('Run "postkit db commit" again to retry from seeds.');
      process.exit(1);
    }
  }

  // Step 7: Cleanup session
  logger.step(7, 7, "Cleaning up session...");

  if (!options.dryRun) {
    try {
      await cleanupStep(spinner);
    } catch (error) {
      logger.warn("Cleanup failed (non-fatal): " + (error instanceof Error ? error.message : String(error)));
      logger.info("The migration was committed successfully. You may need to manually clean up session files.");
    }
  }

  logger.blank();
  logger.success("Migration committed successfully!");
  logger.blank();
  logger.info(`Migration: ${migrationFile.name}`);
  logger.info(`Description: ${description}`);
  logger.blank();
  logger.info("The migration has been applied to the remote database.");
  logger.info('Run "postkit db start" to begin a new migration session.');
}
