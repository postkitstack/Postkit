import ora from "ora";
import path from "path";
import fs from "fs/promises";
import {promptConfirm, promptInput} from "../../../common/prompt";
import {existsSync} from "fs";
import {logger} from "../../../common/logger";
import {requireActiveSession, assertLocalConnection, updatePendingChanges} from "../utils/session";
import {getSessionMigrationsPath, toRelativePath, resolveProjectPath, getDbConfig} from "../utils/db-config";
import {wrapPlanSQL, deletePlanFile} from "../services/pgschema";
import {
  createMigrationFile,
  runSessionMigrate,
  deleteMigrationFile,
} from "../services/dbmate";
import {generateSchemaSQLAndFingerprint} from "../services/schema-generator";
import {applyInfraStep} from "../services/infra-generator";
import {applySeedsStep} from "../services/seed-generator";
import type {CommandOptions} from "../../../common/types";
import type {SessionState} from "../types/index";
import {PostkitError} from "../../../common/errors";

export async function applyCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    const session = await requireActiveSession();

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
    const planFiles = session.pendingChanges.planFiles ?? {};
    const hasPlan =
      session.pendingChanges.planned && Object.values(planFiles).some((f) => f !== null);
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

      if (newFiles.length === 0) {
        logger.warn("Changes have already been applied to the local database.");
        logger.info('Run "postkit db commit" to commit session migrations.');
        logger.info('Or run "postkit db plan" again if you made more changes.');
        return;
      }

      await updatePendingChanges({applied: false});
    }

    // Resume from partial apply?
    if (session.pendingChanges.migrationApplied && newFiles.length === 0) {
      await handleResume(session, options, spinner);
      return;
    }

    if (newFiles.length > 0 && session.pendingChanges.migrationApplied) {
      await updatePendingChanges({
        migrationApplied: false,
        seedsApplied: false,
      });
    }

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
  const description = pc.description;

  logger.heading("Resuming Apply");
  logger.info("Migration was already applied. Resuming from where it left off...");
  logger.blank();

  let step = 1;
  const totalSteps = 2;

  if (!pc.seedsApplied) {
    logger.step(step, totalSteps, "Applying seeds...");
    await applySeedsStep(spinner, session.localDbUrl);
    await updatePendingChanges({seedsApplied: true});
  } else {
    logger.step(step, totalSteps, "Seeds already applied - skipping");
  }

  step++;

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
  const sessionMigrationsDir = getSessionMigrationsPath();
  const config = getDbConfig();

  // Check for NEW manual migration files first
  if (existsSync(sessionMigrationsDir)) {
    const trackedFiles = session.pendingChanges.migrationFiles || [];
    const trackedFileNames = new Set(trackedFiles.map((f) => f.name));
    const files = await fs.readdir(sessionMigrationsDir);
    const newManualFiles = files.filter(
      (f) => f.endsWith(".sql") && !trackedFileNames.has(f),
    );

    if (newManualFiles.length > 0) {
      await handleManualApply(session, options, spinner, newManualFiles.length);
      return;
    }
  }

  const planFiles = session.pendingChanges.planFiles ?? {};
  const hasPlan =
    session.pendingChanges.planned && Object.values(planFiles).some((f) => f !== null);

  if (!hasPlan) {
    await handleManualApply(session, options, spinner);
    return;
  }

  // Validate schema fingerprints — re-hash each schema's source files
  const storedFingerprints = session.pendingChanges.schemaFingerprints ?? {};
  for (const schemaName of config.schemas) {
    const stored = storedFingerprints[schemaName];
    if (stored) {
      const {fingerprint: current} = await generateSchemaSQLAndFingerprint(schemaName);
      if (current !== stored) {
        throw new PostkitError(
          `Schema files for "${schemaName}" have changed since the plan was generated.`,
          'Run "postkit db plan" again to regenerate the plan.',
        );
      }
    }
  }

  logger.heading("Applying Migration to Local Database");

  // Step 1: Show the plan (first non-null plan file)
  logger.step(1, 7, "Loading plan...");
  const firstPlanEntry = Object.entries(planFiles).find(([, f]) => f !== null);
  if (firstPlanEntry) {
    const {default: fsSync} = await import("fs");
    const planPath = resolveProjectPath(firstPlanEntry[1]!);
    if (fsSync.existsSync(planPath)) {
      const content = await fs.readFile(planPath, "utf-8");
      logger.info("Changes to be applied:");
      logger.blank();
      console.log(content);
      logger.blank();
    }
  }

  // Ask for migration description
  const description = await promptInput(
    "Migration description (e.g. add_users_table):",
    {required: true, force: options.force},
  );

  // Step 2: Test local connection
  logger.step(2, 7, "Testing local database connection...");
  await assertLocalConnection(session, spinner);

  // Step 3: Apply infra (roles, schemas, extensions from db/infra/)
  logger.step(3, 7, "Applying infrastructure...");
  await applyInfraStep(spinner, session.localDbUrl);

  // Step 4: Build combined SQL from all per-schema plan files
  logger.step(4, 7, "Creating migration file...");
  spinner.start("Combining schema plans into migration file...");

  let combinedSQL = "";
  for (const schemaName of config.schemas) {
    const relPath = planFiles[schemaName];
    if (!relPath) continue;
    const absPath = resolveProjectPath(relPath);
    const wrapped = await wrapPlanSQL(absPath, schemaName);
    if (wrapped) {
      combinedSQL += (combinedSQL ? "\n\n" : "") + wrapped;
    }
  }

  if (!combinedSQL) {
    spinner.succeed("No changes to apply");
    await updatePendingChanges({applied: true, description});
    logger.blank();
    logger.success("No schema changes to apply.");
    return;
  }

  const migrationFile = await createMigrationFile(
    description,
    combinedSQL,
    undefined,
    sessionMigrationsDir,
  );
  spinner.succeed(`Migration file created: ${migrationFile.name}`);
  logger.info(`Path: ${migrationFile.path}`);

  // Step 5: Apply migration via dbmate on local
  logger.step(5, 7, "Applying migration to local database...");
  spinner.start("Running dbmate migrate...");

  const migrateResult = await runSessionMigrate(session.localDbUrl);

  if (!migrateResult.success) {
    spinner.fail("Failed to apply migration");
    await deleteMigrationFile(resolveProjectPath(migrationFile.path));
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
      {name: migrationFile.name, path: toRelativePath(migrationFile.path)},
    ],
    description,
  });

  // Step 6: Apply seeds
  logger.step(6, 7, "Applying seeds...");
  await applySeedsStep(spinner, session.localDbUrl);
  await updatePendingChanges({seedsApplied: true});

  // Step 7: Mark fully applied and clean up all plan files
  logger.step(7, 7, "Updating session state...");

  await deletePlanFile();

  const clearedPlanFiles: Record<string, string | null> = {};
  for (const schemaName of config.schemas) {
    clearedPlanFiles[schemaName] = null;
  }

  await updatePendingChanges({
    applied: true,
    planned: false,
    planFiles: clearedPlanFiles,
    schemaFingerprints: {},
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
 */
async function handleManualApply(
  session: SessionState,
  options: CommandOptions,
  spinner: ReturnType<typeof ora>,
  newFilesCount?: number,
): Promise<void> {
  logger.heading("Applying Manual Migration");

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

  logger.step(1, 4, "Testing local database connection...");
  await assertLocalConnection(session, spinner);

  logger.step(2, 4, "Applying infrastructure...");
  await applyInfraStep(spinner, session.localDbUrl);

  logger.step(3, 4, "Applying migration(s) to local database...");
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

  const appliedMigrations = migrationFiles.map((name) => ({
    name,
    path: toRelativePath(path.join(sessionMigrationsDir, name)),
  }));

  await updatePendingChanges({
    migrationApplied: true,
    migrationFiles: appliedMigrations,
  });

  logger.step(4, 4, "Applying seeds...");
  await applySeedsStep(spinner, session.localDbUrl);
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
