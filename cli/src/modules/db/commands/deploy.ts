import ora from "ora";
import {logger} from "../../../common/logger";
import {promptConfirm} from "../../../common/prompt";
import {getDbConfig} from "../utils/db-config";
import type {DbConfig} from "../utils/db-config";
import {hasActiveSession, deleteSession} from "../utils/session";
import {deletePlanFile} from "../services/pgschema";
import {deleteGeneratedSchema} from "../services/schema-generator";
import {
  testConnection,
  cloneDatabase,
  dropDatabase,
  getTableCount,
  getRemotePgMajorVersion,
} from "../services/database";
import {runCommittedMigrate, runDbmateStatus} from "../services/dbmate";
import {loadInfra, applyInfra} from "../services/infra-generator";
import {loadSeeds, applySeeds} from "../services/seed-generator";
import {checkDockerAvailable, startSessionContainer, stopSessionContainer, cloneDatabaseViaContainer} from "../services/container";
import {getPendingCommittedMigrations} from "../utils/committed";
import {resolveRemote, maskRemoteUrl, normalizeUrl} from "../utils/remotes";
import type {CommandOptions} from "../../../common/types";
import {PostkitError} from "../../../common/errors";

interface DeployOptions extends CommandOptions {
  remote?: string;
  url?: string;
}

function resolveTargetUrl(options: DeployOptions): {url: string; label: string} {
  if (options.url) {
    return {url: options.url, label: "direct URL"};
  }

  if (options.remote) {
    const resolved = resolveRemote(options.remote);
    return {url: resolved.url, label: resolved.name};
  }

  // Use default remote
  const resolved = resolveRemote();
  return {url: resolved.url, label: `${resolved.name} (default)`};
}

async function resolveLocalDbUrl(
  config: DbConfig,
  spinner: ReturnType<typeof ora>,
  remotePgVersion: number,
): Promise<{url: string; tempContainerID?: string}> {
  if (config.localDbUrl) {
    return {url: config.localDbUrl};
  }
  spinner.start("Checking Docker availability...");
  await checkDockerAvailable();
  spinner.text = `Starting temporary postgres:${remotePgVersion}-alpine container for dry-run...`;
  const container = await startSessionContainer(remotePgVersion);
  spinner.succeed(`Temporary Postgres ${remotePgVersion} container started on port ${container.port}`);
  return {url: container.localDbUrl, tempContainerID: container.containerID};
}

async function confirmAndRemoveSession(
  spinner: ReturnType<typeof ora>,
  options: DeployOptions,
): Promise<void> {
  const confirmed = await promptConfirm(
    "An active migration session exists. Remove it to continue with deploy?",
    {default: false, force: options.force},
  );

  if (!confirmed) {
    throw new PostkitError("Deploy cancelled.", undefined, 0);
  }

  spinner.start("Cleaning up existing session...");
  await deletePlanFile();
  await deleteGeneratedSchema();
  await deleteSession();
  spinner.succeed("Existing session removed");
}

async function runSteps(
  dbUrl: string,
  label: string,
  spinner: ReturnType<typeof ora>,
  stepOffset: number,
  totalSteps: number,
  migrationFilter?: string[],
): Promise<void> {
  let step = stepOffset;

  // Infra
  logger.step(step, totalSteps, `Applying infra to ${label}...`);
  const infra = await loadInfra();

  if (infra.length === 0) {
    spinner.info("No infra files found - skipping");
  } else {
    spinner.start(`Applying infra to ${label}...`);
    await applyInfra(dbUrl);
    spinner.succeed(`Infra applied to ${label} (${infra.length} file(s))`);
  }

  step++;

  // Dbmate migrate
  logger.step(step, totalSteps, `Running migrations on ${label}...`);
  spinner.start(`Running dbmate migrate on ${label}...`);
  const migrateResult = await runCommittedMigrate(dbUrl, migrationFilter);

  if (!migrateResult.success) {
    spinner.fail(`Failed to run migrations on ${label}`);
    throw new Error(migrateResult.output);
  }

  spinner.succeed(`Migrations applied to ${label}`);
  step++;

  // Seeds
  logger.step(step, totalSteps, `Applying seeds to ${label}...`);
  const seeds = await loadSeeds();

  if (seeds.length === 0) {
    spinner.info("No seed files found - skipping");
  } else {
    spinner.start(`Applying seeds to ${label}...`);
    await applySeeds(dbUrl);
    spinner.succeed(`Seeds applied to ${label} (${seeds.length} file(s))`);
  }
}

export async function deployCommand(options: DeployOptions): Promise<void> {
  const spinner = ora();

  try {
    const config = getDbConfig();

    // Step 1: Resolve target URL
    const {url: targetUrl, label: targetLabel} = resolveTargetUrl(options);

    // Validate: localDbUrl cannot equal target URL (skip check if localDbUrl is empty — container will be used)
    if (config.localDbUrl) {
      const normalizedLocalUrl = normalizeUrl(config.localDbUrl);
      const normalizedTargetUrl = normalizeUrl(targetUrl);

      if (normalizedLocalUrl === normalizedTargetUrl) {
        throw new PostkitError(
          `Cannot deploy: localDbUrl equals target URL (${targetLabel}).`,
          "Your local database URL must be different from the target remote. " +
          "Update your postkit.config.json or use a different remote.",
        );
      }
    }

    logger.heading("Deploy Migrations");
    logger.info(`Target: ${targetLabel}`);
    logger.blank();

    // Step 2: Check for pending committed migrations (check target's schema_migrations table)
    const pendingMigrations = await getPendingCommittedMigrations(targetUrl);

    if (pendingMigrations.length === 0) {
      logger.info("No committed migrations pending deployment.");
      logger.blank();
      logger.info("To commit migrations:");
      logger.info('  1. Run "postkit db start" to begin a session');
      logger.info('  2. Make schema changes or run "postkit db plan"');
      logger.info('  3. Run "postkit db apply" to test locally');
      logger.info('  4. Run "postkit db commit" to commit migrations');
      logger.blank();
      return;
    }

    logger.info(`Found ${pendingMigrations.length} committed migration(s) to deploy:`);
    for (const cm of pendingMigrations) {
      logger.info(`  - ${cm.migrationFile.name} (${cm.description})`);
    }
    logger.blank();

    // Step 3: Check for active session
    const sessionActive = await hasActiveSession();

    if (sessionActive) {
      await confirmAndRemoveSession(spinner, options);
      logger.blank();
    }

    // 3 fixed steps (test, status, clone) + 3 runSteps × 2 passes (dry-run + target) + 1 fixed step (cleanup)
    const totalSteps = 3 + 3 * 2 + 1; // = 10
    const migrationNames = pendingMigrations.map(m => m.migrationFile.name);

    // Step 1: Test target DB connection
    logger.step(1, totalSteps, "Testing target database connection...");
    spinner.start("Connecting to target database...");
    const targetConnected = await testConnection(targetUrl);

    if (!targetConnected) {
      spinner.fail("Failed to connect to target database");
      throw new PostkitError(
        "Could not connect to the target database.",
        "Check the remote URL: postkit db remote list",
      );
    }

    const targetTableCount = await getTableCount(targetUrl);
    const remotePgVersion = await getRemotePgMajorVersion(targetUrl);
    spinner.succeed(`Connected to target database (${targetTableCount} tables, PostgreSQL ${remotePgVersion})`);

    // Step 2: Check target migration status
    logger.step(2, totalSteps, "Checking target migration status...");
    spinner.start("Checking migration status...");

    const statusOutput = await runDbmateStatus(targetUrl);

    // Check for pending migrations on target
    const hasPendingItems = statusOutput.includes("[ ") &&
                          !statusOutput.match(/Pending:\s*0\b/);

    if (hasPendingItems) {
      spinner.succeed(`Found ${pendingMigrations.length} pending migration(s) to deploy`);
      logger.blank();
      logger.info("These migrations will be applied to the target database:");
      for (const cm of pendingMigrations) {
        logger.info(`  - ${cm.migrationFile.name} (${cm.description})`);
      }
      logger.blank();
    } else {
      spinner.succeed("Target database up to date");
    }

    // Step 3: Resolve local DB URL (spin up a container if localDbUrl is not configured)
    const {url: localDbUrl, tempContainerID} = await resolveLocalDbUrl(config, spinner, remotePgVersion);

    const cleanupLocal = async () => {
      try { await dropDatabase(localDbUrl); } catch { /* best effort */ }
      if (tempContainerID) {
        try { await stopSessionContainer(tempContainerID); } catch { /* best effort */ }
      }
    };

    logger.step(3, totalSteps, "Cloning target database to local...");
    spinner.start("Cloning target database to local for dry-run verification...");
    if (tempContainerID) {
      await cloneDatabaseViaContainer(tempContainerID, targetUrl, localDbUrl);
    } else {
      await cloneDatabase(targetUrl, localDbUrl);
    }
    const localTableCount = await getTableCount(localDbUrl);
    spinner.succeed(`Target cloned to local (${localTableCount} tables)`);

    // Steps 4-6: Dry run on local clone
    logger.blank();
    logger.heading("Dry Run (local verification)");

    try {
      await runSteps(localDbUrl, "local clone", spinner, 4, totalSteps, migrationNames);
    } catch (error) {
      spinner.fail("Dry run failed on local clone");
      logger.error(error instanceof Error ? error.message : String(error));
      logger.blank();

      // Clean up local clone
      logger.info("Cleaning up local clone...");
      await cleanupLocal();

      throw new PostkitError(
        "Deployment aborted — dry run failed. No changes were made to the target database.",
      );
    }

    logger.blank();
    logger.success("Dry run passed!");
    logger.blank();

    // If --dry-run, stop here — don't touch the target database
    if (options.dryRun) {
      logger.info("Dry run complete. Target database was not modified.");
      await cleanupLocal();
      return;
    }

    // Confirm deployment
    const confirmed = await promptConfirm(
      `Deploy to ${targetLabel}? This will apply ${pendingMigrations.length} migration(s) to the target database.`,
      {default: false, force: options.force},
    );

    if (!confirmed) {
      logger.info("Deploy cancelled.");
      await cleanupLocal();
      return;
    }

    // Steps 7-9: Apply to target
    logger.blank();
    logger.heading("Deploying to Target");

    try {
      await runSteps(targetUrl, targetLabel, spinner, 7, totalSteps, migrationNames);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      logger.blank();
      await cleanupLocal();

      throw new PostkitError(
        "Target deployment failed. The target database may be in a partial state.",
        "Investigate and fix manually, then retry: postkit db deploy",
      );
    }

    // Step 10: Drop local clone and stop temp container
    logger.blank();
    logger.step(10, totalSteps, "Cleaning up local clone...");
    spinner.start("Dropping local clone database...");

    try {
      await dropDatabase(localDbUrl);
      spinner.succeed("Local clone database dropped");
    } catch (error) {
      spinner.warn("Failed to drop local clone (non-fatal): " + (error instanceof Error ? error.message : String(error)));
    }

    if (tempContainerID) {
      spinner.start("Stopping temporary container...");
      try {
        await stopSessionContainer(tempContainerID);
        spinner.succeed("Temporary container stopped and removed");
      } catch {
        spinner.warn("Could not stop temporary container (non-fatal)");
      }
    }

    // Report success
    logger.blank();
    logger.success(`Deployment to ${targetLabel} completed successfully!`);
    logger.blank();
    logger.info(`Deployed ${pendingMigrations.length} migration(s):`);
    for (const cm of pendingMigrations) {
      logger.info(`  ✓ ${cm.migrationFile.name} - ${cm.description}`);
    }
    logger.blank();
  } catch (error) {
    spinner.fail("Deployment failed");
    throw error;
  }
}
