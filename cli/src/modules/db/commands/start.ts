import ora from "ora";
import path from "path";
import {existsSync} from "fs";
import fs from "fs/promises";
import {logger} from "../../../common/logger";
import {promptConfirm} from "../../../common/prompt";
import {getDbConfig} from "../utils/db-config";
import {createSession, hasActiveSession, getSession} from "../utils/session";
import {resolveRemote, maskRemoteUrl} from "../utils/remotes";
import {
  testConnection,
  cloneDatabase,
  getTableCount,
  getRemotePgMajorVersion,
} from "../services/database";
import {runDbmateStatus} from "../services/dbmate";
import {checkDbPrerequisites} from "../services/prerequisites";
import {resolveLocalDb, cloneDatabaseViaContainer} from "../services/container";
import {applyInfraStep} from "../services/infra-generator";
import {getPendingCommittedMigrations} from "../utils/committed";
import type {CommandOptions} from "../../../common/types";
import {PostkitError} from "../../../common/errors";

interface StartOptions extends CommandOptions {
  remote?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const spinner = ora();

  try {
    if (await hasActiveSession()) {
      const session = await getSession();
      throw new PostkitError(
        `An active migration session already exists (started at ${session?.startedAt}).`,
        'Run "postkit db abort" to cancel it, or "postkit db status" to see details.',
      );
    }

    logger.heading("Starting Migration Session");

    // Step 1: Check prerequisites
    logger.step(1, 5, "Checking prerequisites...");

    await checkDbPrerequisites(options.verbose ?? false, {requirePsql: true});

    // Step 2: Load configuration
    logger.step(2, 5, "Loading configuration...");

    const config = getDbConfig();

    // Determine whether we need an auto-container (localDbUrl is empty)
    let localDbUrl = config.localDbUrl;
    let containerID: string | undefined;
    const needsContainer = !localDbUrl;

    // Total steps: 6 normally, 7 when auto-container is needed (extra step for infra apply)
    const totalSteps = needsContainer ? 7 : 6;

    // Resolve remote
    let targetRemoteName: string;
    let targetRemoteUrl: string;

    try {
      const resolved = resolveRemote(options.remote);
      targetRemoteName = resolved.name;
      targetRemoteUrl = resolved.url;

      if (options.remote) {
        logger.info(`Using remote: ${targetRemoteName}`);
      } else {
        logger.debug(`Using default remote: ${targetRemoteName}`, options.verbose);
      }
    } catch (error) {
      throw new PostkitError(
        error instanceof Error ? error.message : String(error),
        "Manage remotes with:\n" +
        "  postkit db remote list   — list all remotes\n" +
        "  postkit db remote add    — add a new remote\n" +
        "  postkit db remote use    — set the default remote",
      );
    }

    logger.debug(
      `Remote DB (${targetRemoteName}): ${maskRemoteUrl(targetRemoteUrl)}`,
      options.verbose,
    );
    if (localDbUrl) {
      logger.debug(
        `Local DB: ${maskRemoteUrl(localDbUrl)}`,
        options.verbose,
      );
    }

    // Ensure .pgschemaignore exists in schema directory
    await ensurePgschemaIgnore(config.schemaPath);

    // Step 3: Test remote connection
    logger.step(3, totalSteps, "Testing remote database connection...");
    spinner.start("Connecting to remote database...");

    const remoteConnected = await testConnection(targetRemoteUrl);

    if (!remoteConnected) {
      spinner.fail("Failed to connect to remote database");
      throw new PostkitError(
        "Could not connect to the remote database.",
        "Check the URL for this remote: postkit db remote list",
      );
    }

    spinner.succeed("Connected to remote database");

    const remoteTableCount = await getTableCount(targetRemoteUrl);
    logger.info(`Remote database has ${remoteTableCount} tables`);

    const remotePgVersion = await getRemotePgMajorVersion(targetRemoteUrl);
    logger.debug(`Remote PostgreSQL version: ${remotePgVersion}`, options.verbose);

    // Step 4: Verify database state
    logger.step(4, totalSteps, "Verifying database state...");

    // Check 1: Pending committed migrations (check remote's schema_migrations table)
    const pendingCommitted = await getPendingCommittedMigrations(targetRemoteUrl);

    if (pendingCommitted.length > 0) {
      logger.blank();
      logger.error("Database state verification failed!");
      logger.blank();
      logger.warn(`You have ${pendingCommitted.length} committed migration(s) pending deployment:`);
      for (const cm of pendingCommitted) {
        logger.warn(`  - ${cm.migrationFile.name} (${cm.description})`);
      }
      logger.blank();
      logger.error("Cannot start a new session while committed migrations are pending deployment.");
      logger.info("The remote database is not in sync with your committed migrations.");
      logger.blank();
      logger.info("To fix this:");
      logger.info('  1. Run "postkit db deploy" to deploy committed migrations');
      logger.info("  2. Then run \"postkit db start\" again");
      logger.blank();
      throw new PostkitError(
        `Cannot start a new session — ${pendingCommitted.length} committed migration(s) are pending deployment.`,
        'Run "postkit db deploy" to deploy them, then try "postkit db start" again.\n' +
        "  (To discard committed migrations, delete .postkit/committed.json manually.)",
      );
    }

    spinner.succeed("No pending committed migrations");

    // Check 2: Run dbmate status to detect any pending migrations
    spinner.start("Checking migration status...");
    const statusOutput = await runDbmateStatus(targetRemoteUrl);

    // Check if there are actually pending migrations (look for [ ] unchecked items or Pending > 0)
    // dbmate status shows "[ ] filename.sql" for pending and "[X] filename.sql" for applied
    const hasPendingItems = statusOutput.includes("[ ") && !statusOutput.match(/Pending:\s*0\b/);

    if (hasPendingItems) {
      spinner.warn("Found pending migrations in migrations directory");
      logger.blank();
      logger.warn("dbmate status output:");
      console.log(statusOutput);
      logger.blank();
      logger.warn("There are migration files in your migrations/ directory that haven't been applied to the remote database.");
      logger.info("This may cause unexpected behavior. Consider:");
      logger.info('  1. Applying these migrations to the remote database first');
      logger.info('  2. Or removing/moving these migration files if they\'re not needed');
      logger.blank();

      // Ask user if they want to continue
      const confirmed = await promptConfirm(
        "Continue starting session despite pending migrations?",
        {default: false, force: options.force},
      );

      if (!confirmed) {
        throw new PostkitError("Session start cancelled.", undefined, 0);
      }

      if (options.force) {
        logger.info("Continuing due to --force flag...");
      }
    } else {
      spinner.succeed("All migrations applied - database is in sync");
    }

    // Step 5 (only when no localDbUrl): Start local Postgres container
    if (needsContainer) {
      logger.step(5, totalSteps, "Starting local Postgres container...");
      const resolved = await resolveLocalDb(localDbUrl, targetRemoteUrl, spinner);
      containerID = resolved.containerID;
      localDbUrl = resolved.url;
      logger.debug(`Local DB (container): ${maskRemoteUrl(localDbUrl)}`, options.verbose);
    }

    // Apply infra (roles, schemas, extensions) to the local DB BEFORE cloning.
    // pg_dump's output includes CREATE POLICY / GRANT / ALTER DEFAULT PRIVILEGES
    // statements that name custom roles (e.g. app_admin, employee, service_role).
    // Those statements fail with "role does not exist" if replayed against a
    // fresh local DB/container that doesn't have the roles yet — and since psql
    // isn't run with ON_ERROR_STOP during the clone, those failures are silent,
    // silently dropping RLS policies and grants from the local clone.
    const infraStep = needsContainer ? 6 : 5;
    logger.step(infraStep, totalSteps, "Applying infrastructure to local database...");
    if (options.dryRun) {
      spinner.info("Dry run - skipping infra apply");
    } else {
      await applyInfraStep(spinner, localDbUrl);
    }

    // Step: Clone database (structure only — no row data. RLS policies and
    // grants still clone, since infra was applied above before this runs.)
    const cloneStep = needsContainer ? 7 : 6;
    logger.step(cloneStep, totalSteps, "Cloning remote database structure to local...");
    spinner.start("Cloning database structure (this may take a moment)...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping database clone");
    } else {
      if (containerID) {
        // Run pg_dump/psql inside the container — version-matched with remote
        await cloneDatabaseViaContainer(containerID, targetRemoteUrl, localDbUrl, true);
      } else {
        await cloneDatabase(targetRemoteUrl, localDbUrl, true);
      }
      spinner.succeed("Database structure cloned successfully");

      const localTableCount = await getTableCount(localDbUrl);
      logger.info(`Local database has ${localTableCount} tables (structure only, no row data)`);
    }

    // Final step: Create session
    logger.step(totalSteps, totalSteps, "Creating session...");

    if (!options.dryRun) {
      const session = await createSession(
        targetRemoteUrl,
        localDbUrl,
        targetRemoteName,
        containerID,
      );
      logger.success(`Session created (cloned at: ${session.clonedAt})`);
    } else {
      logger.info("Dry run - session not created");
    }

    logger.blank();
    logger.success("Migration session started!");
    logger.blank();
    logger.info("Next steps:");
    logger.info("  1. Modify schema files in db/schema/");
    logger.info('  2. Run "postkit db plan" to see changes');
    logger.info('  3. Run "postkit db apply" to test on local clone');
    logger.info('  4. Run "postkit db commit <description>" when ready');
  } catch (error) {
    spinner.fail("Failed to start migration session");
    throw error;
  }
}

async function ensurePgschemaIgnore(schemaPath: string): Promise<void> {
  const ignorePath = path.join(schemaPath, ".pgschemaignore");

  if (existsSync(ignorePath)) {
    return;
  }

  const content = [
    "[tables]",
    'patterns = ["schema_migrations"]',
    "",
  ].join("\n");

  await fs.writeFile(ignorePath, content, "utf-8");
}
