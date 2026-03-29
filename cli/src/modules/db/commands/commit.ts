import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {getSession, deleteSession, updateSession} from "../utils/session";
import {getSessionMigrationsPath} from "../utils/db-config";
import {deletePlanFile} from "../services/pgschema";
import {runDbmateMigrate, copySessionMigrations, deleteSessionMigrations} from "../services/dbmate";
import {deleteGeneratedSchema} from "../services/schema-generator";
import {testConnection} from "../services/database";
import {applyInfra, generateInfra} from "../services/infra-generator";
import {applyGrants, generateGrants} from "../services/grant-generator";
import {applySeeds, generateSeeds} from "../services/seed-generator";
import type {CommandOptions} from "../../../common/types";
import type {CommitState, SessionState} from "../types/index";

async function applyInfraStep(
  remoteDbUrl: string,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const infra = await generateInfra();

  if (infra.length === 0) {
    spinner.info("No infra files found - skipping");
    return;
  }

  spinner.start("Applying infra to remote database...");
  await applyInfra(remoteDbUrl);
  spinner.succeed(`Infra applied to remote (${infra.length} file(s))`);
}

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
  const sessionMigrationsDir = getSessionMigrationsPath();
  await deleteSessionMigrations(sessionMigrationsDir);
  await deletePlanFile();
  await deleteGeneratedSchema();
  await deleteSession();
  spinner.succeed("Session cleaned up");
}

async function saveCommitState(
  commitState: CommitState,
): Promise<void> {
  await updateSession({commitState});
}

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

    // Check for resume from previous failed commit
    if (session.commitState) {
      await handleResume(session, spinner);
      return;
    }

    // Fresh commit flow
    await handleFreshCommit(session, options, spinner);
  } catch (error) {
    spinner.fail("Failed to commit migration");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function handleResume(
  session: SessionState,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const commitState = session.commitState!;

  if (!commitState.remoteApplied) {
    // Migration was not applied to remote — retry
    logger.heading("Resuming Commit");
    logger.info("Retrying remote migration...");
    logger.blank();

    // Retry dbmate migrate on remote
    logger.step(1, 4, "Applying migration to remote...");
    spinner.start("Running dbmate migrate on remote...");

    const migrateResult = await runDbmateMigrate(session.remoteDbUrl);

    if (!migrateResult.success) {
      spinner.fail("Failed to apply migration to remote");
      logger.error(migrateResult.output);
      logger.info('Run "postkit db commit" again to retry.');
      process.exit(1);
    }

    spinner.succeed("Migration applied to remote database");

    await saveCommitState({
      ...commitState,
      remoteApplied: true,
    });

    // Continue with grants/seeds/cleanup
    await finishCommit(session, commitState, spinner, 2, 4);
    return;
  }

  // Migration was applied to remote — resume from grants/seeds
  logger.heading("Resuming Commit");
  logger.info("Migration was already applied to remote. Resuming...");
  logger.blank();

  await finishCommit(session, commitState, spinner, 1, 3);
}

async function finishCommit(
  session: SessionState,
  commitState: CommitState,
  spinner: ReturnType<typeof ora>,
  startStep: number,
  totalSteps: number,
): Promise<void> {
  let step = startStep;

  // Grants
  if (!commitState.grantsApplied) {
    logger.step(step, totalSteps, "Applying grants to remote...");

    try {
      await applyGrantsStep(session.remoteDbUrl, spinner);
    } catch (error) {
      spinner.fail("Failed to apply grants");
      logger.error(error instanceof Error ? error.message : String(error));
      await saveCommitState({
        ...commitState,
        remoteApplied: true,
        infraApplied: true,
        grantsApplied: false,
      });
      logger.blank();
      logger.warn("Grants failed. The migration has already been applied to remote.");
      logger.info('Run "postkit db commit" again to retry.');
      process.exit(1);
    }

    await saveCommitState({
      ...commitState,
      remoteApplied: true,
      infraApplied: true,
      grantsApplied: true,
    });
  } else {
    logger.step(step, totalSteps, "Grants already applied - skipping");
  }

  step++;

  // Seeds
  if (!commitState.seedsApplied) {
    logger.step(step, totalSteps, "Applying seeds to remote...");

    try {
      await applySeedsStep(session.remoteDbUrl, spinner);
    } catch (error) {
      spinner.fail("Failed to apply seeds");
      logger.error(error instanceof Error ? error.message : String(error));
      await saveCommitState({
        ...commitState,
        remoteApplied: true,
        infraApplied: true,
        grantsApplied: true,
        seedsApplied: false,
      });
      logger.blank();
      logger.warn("Seeds failed. The migration and grants have already been applied.");
      logger.info('Run "postkit db commit" again to retry.');
      process.exit(1);
    }
  } else {
    logger.step(step, totalSteps, "Seeds already applied - skipping");
  }

  step++;

  // Cleanup
  logger.step(step, totalSteps, "Cleaning up session...");

  try {
    await cleanupStep(spinner);
  } catch (error) {
    logger.warn("Cleanup failed (non-fatal): " + (error instanceof Error ? error.message : String(error)));
    logger.info("The migration was committed successfully. You may need to manually clean up session files.");
  }

  const description = commitState.description;
  const migrationFile = commitState.migrationFile;

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
  options: CommandOptions,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  // Check if apply was done
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

  logger.heading("Committing Migration to Remote");
  logger.blank();
  logger.info(`Migrations to commit (${migrationFiles.length} file(s)):`);
  for (const mf of migrationFiles) {
    logger.info(`  - ${mf.name}`);
  }
  logger.blank();

  // Confirm unless force flag
  if (!options.force) {
    const {confirm} = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Apply migration(s) to remote database?",
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info("Commit cancelled.");
      return;
    }
  }

  // Step 1: Test remote connection
  logger.step(1, 7, "Testing remote database connection...");
  spinner.start("Connecting to remote database...");

  const remoteConnected = await testConnection(session.remoteDbUrl);

  if (!remoteConnected) {
    spinner.fail("Failed to connect to remote database");
    logger.error("Could not connect to the remote database.");
    logger.info("Fix the connection and retry with: postkit db commit");
    process.exit(1);
  }

  spinner.succeed("Connected to remote database");

  // Step 2: Apply infra to remote
  logger.step(2, 7, "Applying infra to remote...");

  try {
    await applyInfraStep(session.remoteDbUrl, spinner);
  } catch (error) {
    spinner.fail("Failed to apply infra");
    logger.error(error instanceof Error ? error.message : String(error));
    logger.info("Fix the issue and retry with: postkit db commit");
    process.exit(1);
  }

  // Step 3: Copy session migrations to root migrations folder
  logger.step(3, 7, "Copying migration files to migrations folder...");
  spinner.start("Copying migration files...");
  const copied = await copySessionMigrations(sessionMigrationsDir);
  spinner.succeed(`Copied ${copied.length} migration file(s) to migrations folder`);

  // Save commit state
  await saveCommitState({
    migrationFile: migrationFiles[migrationFiles.length - 1],
    remoteApplied: false,
    infraApplied: true,
    grantsApplied: false,
    seedsApplied: false,
    description,
  });

  // Step 4: Apply migration to remote via dbmate (uses root migrations dir)
  logger.step(4, 7, "Applying migration to remote database...");
  spinner.start("Running dbmate migrate on remote...");

  const migrateResult = await runDbmateMigrate(session.remoteDbUrl);

  if (!migrateResult.success) {
    spinner.fail("Failed to apply migration to remote");
    logger.error("Migration failed on remote database:");
    console.log(migrateResult.output);
    logger.info('Run "postkit db commit" again to retry.');
    process.exit(1);
  }

  spinner.succeed("Migration applied to remote database");

  if (migrateResult.output) {
    logger.debug(migrateResult.output, options.verbose);
  }

  // Mark remote as applied
  await saveCommitState({
    migrationFile: migrationFiles[migrationFiles.length - 1],
    remoteApplied: true,
    infraApplied: true,
    grantsApplied: false,
    seedsApplied: false,
    description,
  });

  // Steps 5-7: grants, seeds, cleanup
  const commitState: CommitState = {
    migrationFile: migrationFiles[migrationFiles.length - 1],
    remoteApplied: true,
    infraApplied: true,
    grantsApplied: false,
    seedsApplied: false,
    description,
  };

  await finishCommit(session, commitState, spinner, 5, 7);
}
