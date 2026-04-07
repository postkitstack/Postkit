import ora from "ora";
import inquirer from "inquirer";
import fs from "fs/promises";
import {promptConfirm, promptInput} from "../../../common/prompt";
import {existsSync} from "fs";
import {logger} from "../../../common/logger";
import {getSession, updatePendingChanges} from "../utils/session";
import {getSessionMigrationsPath} from "../utils/db-config";
import {wrapPlanSQL, getPlanFileContent} from "../services/pgschema";
import {testConnection} from "../services/database";
import {
  createMigrationFile,
  runSessionMigrate,
  deleteMigrationFile,
} from "../services/dbmate";
import {generateSchemaFingerprint} from "../services/schema-generator";
import {applyInfra, loadInfra} from "../services/infra-generator";
import {applyGrants, loadGrants} from "../services/grant-generator";
import {applySeeds, loadSeeds} from "../services/seed-generator";
import type {CommandOptions} from "../../../common/types";
import type {SessionState} from "../types/index";
import {PostkitError} from "../../../common/errors";

async function applyInfraStep(
  spinner: ReturnType<typeof ora>,
  dbUrl: string,
): Promise<void> {
  const infra = await loadInfra();
  if (infra.length === 0) {
    spinner.info("No infra files found - skipping");
    return;
  }
  spinner.start("Applying infra...");
  await applyInfra(dbUrl);
  spinner.succeed(`Infra applied (${infra.length} file(s))`);
}

async function applyGrantsStep(
  spinner: ReturnType<typeof ora>,
  dbUrl: string,
  retryHint: string,
): Promise<void> {
  const grants = await loadGrants();
  if (grants.length === 0) {
    spinner.info("No grant files found - skipping");
    return;
  }
  try {
    spinner.start("Applying grants...");
    await applyGrants(dbUrl);
    spinner.succeed(`Grants applied (${grants.length} file(s))`);
  } catch (error) {
    spinner.fail("Failed to apply grants");
    throw new PostkitError(
      `Grants failed: ${error instanceof Error ? error.message : String(error)}`,
      retryHint,
    );
  }
}

async function applySeedsStep(
  spinner: ReturnType<typeof ora>,
  dbUrl: string,
  retryHint: string,
): Promise<void> {
  const seeds = await loadSeeds();
  if (seeds.length === 0) {
    spinner.info("No seed files found - skipping");
    return;
  }
  try {
    spinner.start("Applying seed data...");
    await applySeeds(dbUrl);
    spinner.succeed(`Seeds applied (${seeds.length} file(s))`);
  } catch (error) {
    spinner.fail("Failed to apply seeds");
    throw new PostkitError(
      `Seeds failed: ${error instanceof Error ? error.message : String(error)}`,
      retryHint,
    );
  }
}

export async function applyCommand(options: CommandOptions): Promise<void> {
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

    // Confirm apply operation (unless force flag)
    const confirmed = await promptConfirm(
      "Apply migration changes to the local database?",
      {default: true, force: options.force},
    );

    if (!confirmed) {
      logger.info("Apply cancelled.");
      return;
    }

    // Check for migration files in session directory FIRST
    const sessionMigrationsDir = getSessionMigrationsPath();
    let migrationFiles: string[] = [];

    if (existsSync(sessionMigrationsDir)) {
      const files = await fs.readdir(sessionMigrationsDir);
      migrationFiles = files.filter((f) => f.endsWith(".sql"));
    }

    // Determine current state
    const hasPlan =
      session.pendingChanges.planned && session.pendingChanges.planFile;
    const hasMigrations = migrationFiles.length > 0;
    const isAlreadyApplied = session.pendingChanges.applied;

    // Nothing to do?
    if (!hasMigrations && !hasPlan) {
      if (isAlreadyApplied) {
        logger.warn("Changes have already been applied to the local database.");
        logger.info('Run "postkit db commit" to commit session migrations.');
      } else {
        logger.error("No migration plan found.");
        logger.info('Run "postkit db plan" first to generate a plan.');
        logger.info(
          'Or run "postkit db migration <name>" to create a manual migration.',
        );
      }
      return;
    }

    // Check for NEW migration files (compare disk vs tracked)
    const trackedFiles = session.pendingChanges.migrationFiles || [];
    const trackedFileNames = new Set(trackedFiles.map((f) => f.name));
    const newFiles = migrationFiles.filter((f) => !trackedFileNames.has(f));

    // Show migration files with status
    if (hasMigrations && !hasPlan) {
      if (newFiles.length > 0) {
        logger.info(
          `Found ${migrationFiles.length} migration file(s) (${newFiles.length} new):`,
        );
        for (const file of migrationFiles) {
          const isNew = !trackedFileNames.has(file);
          const status = isNew ? "new" : "applied";
          logger.info(`  - ${file} (${status})`);
        }
        logger.blank();
      } else if (!isAlreadyApplied) {
        // First time applying, all files are new
        logger.info(`Found ${migrationFiles.length} migration file(s):`);
        for (const file of migrationFiles) {
          logger.info(`  - ${file} (new)`);
        }
        logger.blank();
      }
    }

    // Check if already applied (but allow re-applying if files exist)
    if (isAlreadyApplied) {
      if (migrationFiles.length === 0) {
        logger.warn("Changes have already been applied to the local database.");
        logger.info('Run "postkit db commit" to commit session migrations.');
        logger.info('Or run "postkit db plan" again if you made more changes.');
        return;
      }

      // Files exist, check for new ones
      if (newFiles.length === 0) {
        // No new files, already fully applied
        logger.warn("Changes have already been applied to the local database.");
        logger.info('Run "postkit db commit" to commit session migrations.');
        logger.info('Or run "postkit db plan" again if you made more changes.');
        return;
      }

      // New files exist - reset applied flag to allow applying them
      await updatePendingChanges({applied: false});
    }

    // Resume from partial apply?
    // Only resume if NO new migration files exist
    if (session.pendingChanges.migrationApplied && newFiles.length === 0) {
      await handleResume(session, options, spinner);
      return;
    }

    // If we have new files, reset migrationApplied to allow applying them
    if (newFiles.length > 0 && session.pendingChanges.migrationApplied) {
      await updatePendingChanges({
        migrationApplied: false,
        grantsApplied: false,
        seedsApplied: false,
      });
    }

    // Fresh apply flow
    await handlePlanApply(session, options, spinner);
  } catch (error) {
    spinner.fail("Failed to apply migration");
    throw error;
  }
}

async function handleResume(
  session: SessionState,
  _options: CommandOptions,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const pc = session.pendingChanges;

  // Description should always be set when applying migrations
  const description = pc.description;

  logger.heading("Resuming Apply");
  logger.info(
    "Migration was already applied. Resuming from where it left off...",
  );
  logger.blank();

  let step = 1;
  const totalSteps = 3; // grants, seeds, update session

  // Grants
  if (!pc.grantsApplied) {
    logger.step(step, totalSteps, "Applying grants...");
    await applyGrantsStep(
      spinner,
      session.localDbUrl,
      'Run "postkit db apply" again to retry from grants.',
    );
    await updatePendingChanges({grantsApplied: true});
  } else {
    logger.step(step, totalSteps, "Grants already applied - skipping");
  }

  step++;

  // Seeds
  if (!pc.seedsApplied) {
    logger.step(step, totalSteps, "Applying seeds...");
    await applySeedsStep(
      spinner,
      session.localDbUrl,
      'Run "postkit db apply" again to retry from seeds.',
    );
    await updatePendingChanges({seedsApplied: true});
  } else {
    logger.step(step, totalSteps, "Seeds already applied - skipping");
  }

  step++;

  // Mark fully applied
  logger.step(step, totalSteps, "Updating session state...");
  await updatePendingChanges({applied: true});

  const migrationFiles = pc.migrationFiles || [];
  const latestMigration =
    migrationFiles.length > 0
      ? (migrationFiles[migrationFiles.length - 1]?.name ?? "unknown")
      : "unknown";

  logger.blank();
  logger.success("Migration applied to local database!");
  logger.blank();
  logger.info(`Migration: ${latestMigration}`);
  logger.info(`Description: ${description}`);
  logger.blank();
  logger.info("Next steps:");
  logger.info('  - Run "postkit db commit" to commit session migrations');
}

async function handlePlanApply(
  session: SessionState,
  options: CommandOptions,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  // Get session migrations path (used in multiple places)
  const sessionMigrationsDir = getSessionMigrationsPath();

  // Check for NEW manual migration files first (before plan check)

  if (existsSync(sessionMigrationsDir)) {
    const trackedFiles = session.pendingChanges.migrationFiles || [];
    const trackedFileNames = new Set(trackedFiles.map((f) => f.name));
    const files = await fs.readdir(sessionMigrationsDir);
    const newManualFiles = files.filter(
      (f) => f.endsWith(".sql") && !trackedFileNames.has(f),
    );

    // If new manual files exist, use manual flow even if plan exists
    if (newManualFiles.length > 0) {
      await handleManualApply(
        session,
        options,
        spinner,
        newManualFiles.length,
      );
      return;
    }
  }

  // Check if this is a manual migration (no plan file)
  const hasPlan =
    session.pendingChanges.planned && session.pendingChanges.planFile;

  if (!hasPlan) {
    // Manual migration flow - skip plan steps, apply existing files
    await handleManualApply(session, options, spinner);
    return;
  }

  // Plan-based migration flow (original logic)
  // Validate schema fingerprint
  if (session.pendingChanges.schemaFingerprint) {
    const currentFingerprint = await generateSchemaFingerprint();

    if (currentFingerprint !== session.pendingChanges.schemaFingerprint) {
      throw new PostkitError(
        "Schema files have changed since the plan was generated.",
        'Run "postkit db plan" again to regenerate the plan.',
      );
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
  const description = await promptInput(
    "Migration description (e.g. add_users_table):",
    {required: true, force: options.force},
  );

  // Step 2: Test local connection
  logger.step(2, 8, "Testing local database connection...");
  spinner.start("Connecting to local database...");

  const localConnected = await testConnection(session.localDbUrl);

  if (!localConnected) {
    spinner.fail("Failed to connect to local database");
    throw new PostkitError(
      "Could not connect to the local database.",
      'The local clone may have been removed. Run "postkit db start" again.',
    );
  }

  spinner.succeed("Connected to local database");

  // Step 3: Apply infra (roles, schemas, extensions)
  logger.step(3, 8, "Applying infrastructure...");
  await applyInfraStep(spinner, session.localDbUrl);

  // Step 4: Create migration file in session migrations dir
  logger.step(4, 8, "Creating migration file...");

  spinner.start("Wrapping plan and creating migration file...");

  if (!session.pendingChanges.planFile) {
    throw new PostkitError(
      "Plan file path is missing from session state.",
      'Run "postkit db plan" again to regenerate the plan.',
    );
  }

  const wrappedSQL = await wrapPlanSQL(session.pendingChanges.planFile);

  if (!wrappedSQL) {
    spinner.succeed("No changes to apply");
    await updatePendingChanges({applied: true, description});
    logger.blank();
    logger.success("No schema changes to apply.");
    return;
  }

  const migrationFile = await createMigrationFile(
    description,
    wrappedSQL,
    undefined,
    sessionMigrationsDir,
  );
  spinner.succeed(`Migration file created: ${migrationFile.name}`);
  logger.info(`Path: ${migrationFile.path}`);

  // Step 5: Apply migration via dbmate on local
  logger.step(5, 8, "Applying migration to local database...");
  spinner.start("Running dbmate migrate...");

  const migrateResult = await runSessionMigrate(session.localDbUrl);

  if (!migrateResult.success) {
    spinner.fail("Failed to apply migration");
    await deleteMigrationFile(migrationFile.path);
    throw new PostkitError(
      `Migration apply failed:\n${migrateResult.output}`,
      'Migration file has been cleaned up. Fix the SQL and run "postkit db apply" again.',
    );
  }

  spinner.succeed("Migration applied to local database");

  if (migrateResult.output) {
    logger.debug(migrateResult.output, options.verbose);
  }

  // Save progress: migration applied
  const existingFiles = session.pendingChanges.migrationFiles || [];
  await updatePendingChanges({
    migrationApplied: true,
    migrationFiles: [
      ...existingFiles,
      {name: migrationFile.name, path: migrationFile.path},
    ],
    description,
  });

  // Step 6: Apply grants
  logger.step(6, 8, "Applying grants...");
  await applyGrantsStep(
    spinner,
    session.localDbUrl,
    'Migration is already applied. Run "postkit db apply" again to retry from grants.',
  );
  await updatePendingChanges({grantsApplied: true});

  // Step 7: Apply seeds
  logger.step(7, 8, "Applying seeds...");
  await applySeedsStep(
    spinner,
    session.localDbUrl,
    'Migration and grants are already applied. Run "postkit db apply" again to retry from seeds.',
  );
  await updatePendingChanges({seedsApplied: true});

  // Step 8: Mark fully applied and clean up plan file
  logger.step(8, 8, "Updating session state...");

  // Clean up plan file since migration is now committed to session files
  if (session.pendingChanges.planFile) {
    if (existsSync(session.pendingChanges.planFile)) {
      await fs.unlink(session.pendingChanges.planFile);
    }
  }

  await updatePendingChanges({
    applied: true,
    planned: false,
    planFile: null,
    schemaFingerprint: null,
  });

  logger.blank();
  logger.success("Migration applied to local database!");
  logger.blank();
  logger.info(`Migration: ${migrationFile.name}`);
  logger.info(`Description: ${description}`);
  logger.blank();
  logger.info("Next steps:");
  logger.info("  - Verify the changes work correctly");
  logger.info('  - Run "postkit db commit" to commit session migrations');
  logger.info('  - Or run "postkit db plan" again if you need more changes');
  logger.info('  - Or run "postkit db abort" to cancel if something is wrong');
}

/**
 * Handle manual migration apply (no plan file).
 * User has created migration files manually with `postkit db migration`.
 */
async function handleManualApply(
  session: SessionState,
  options: CommandOptions,
  spinner: ReturnType<typeof ora>,
  newFilesCount?: number,
): Promise<void> {
  logger.heading("Applying Manual Migration");

  // Get migration files from session directory
  const sessionMigrationsDir = getSessionMigrationsPath();

  if (!existsSync(sessionMigrationsDir)) {
    throw new PostkitError(
      "No migration files found in session directory.",
      'Run "postkit db migration <name>" to create a manual migration.',
    );
  }

  const files = await fs.readdir(sessionMigrationsDir);
  const migrationFiles = files.filter((f) => f.endsWith(".sql"));

  if (migrationFiles.length === 0) {
    throw new PostkitError(
      "No migration files found in session directory.",
      'Run "postkit db migration <name>" to create a manual migration.',
    );
  }

  // Step 1: Test local connection
  logger.step(1, 5, "Testing local database connection...");
  spinner.start("Connecting to local database...");

  const localConnected = await testConnection(session.localDbUrl);

  if (!localConnected) {
    spinner.fail("Failed to connect to local database");
    throw new PostkitError(
      "Could not connect to the local database.",
      'The local clone may have been removed. Run "postkit db start" again.',
    );
  }

  spinner.succeed("Connected to local database");

  // Step 2: Apply infra
  logger.step(2, 5, "Applying infrastructure...");
  await applyInfraStep(spinner, session.localDbUrl);

  // Step 3: Apply migrations via dbmate
  logger.step(3, 5, "Applying migration(s) to local database...");
  spinner.start("Running dbmate migrate...");

  const migrateResult = await runSessionMigrate(session.localDbUrl);

  if (!migrateResult.success) {
    spinner.fail("Failed to apply migration(s)");
    throw new PostkitError(
      `Migration apply failed:\n${migrateResult.output}`,
      'Fix the SQL in your migration file, then run "postkit db apply" again.',
    );
  }

  spinner.succeed("Migration(s) applied to local database");

  if (migrateResult.output) {
    logger.debug(migrateResult.output, options.verbose);
  }

  // Track applied migrations
  const appliedMigrations = migrationFiles.map((name) => ({
    name,
    path: `${sessionMigrationsDir}/${name}`,
  }));

  await updatePendingChanges({
    migrationApplied: true,
    migrationFiles: appliedMigrations,
  });

  // Step 4: Apply grants
  logger.step(4, 5, "Applying grants...");
  await applyGrantsStep(
    spinner,
    session.localDbUrl,
    'Migration(s) are already applied. Run "postkit db apply" again to retry from grants.',
  );
  await updatePendingChanges({grantsApplied: true});

  // Step 5: Apply seeds
  logger.step(5, 5, "Applying seeds...");
  await applySeedsStep(
    spinner,
    session.localDbUrl,
    'Migration(s) and grants are already applied. Run "postkit db apply" again to retry from seeds.',
  );
  await updatePendingChanges({seedsApplied: true, applied: true});

  logger.blank();
  logger.success("Migration(s) applied to local database!");
  logger.blank();
  logger.info(`Files: ${migrationFiles.join(", ")}`);
  logger.blank();
  logger.info("Next steps:");
  logger.info("  - Verify the changes work correctly");
  logger.info('  - Run "postkit db commit" to commit session migrations');
  logger.info('  - Or run "postkit db abort" to cancel if something is wrong');
}
