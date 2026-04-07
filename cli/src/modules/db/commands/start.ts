import ora from "ora";
import inquirer from "inquirer";
import path from "path";
import {promptConfirm} from "../../../common/prompt";
import {existsSync} from "fs";
import fs from "fs/promises";
import {logger} from "../../../common/logger";
import {getConfig} from "../utils/db-config";
import {createSession, hasActiveSession, getSession} from "../utils/session";
import {resolveRemote, maskRemoteUrl} from "../utils/remotes";
import {
  testConnection,
  cloneDatabase,
  getTableCount,
} from "../services/database";
import {checkPgschemaInstalled} from "../services/pgschema";
import {checkDbmateInstalled, runDbmateStatus} from "../services/dbmate";
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

    const pgschemaInstalled = await checkPgschemaInstalled();
    const dbmateInstalled = await checkDbmateInstalled();

    if (!pgschemaInstalled) {
      throw new PostkitError(
        "pgschema binary not found.",
        "Visit: https://github.com/pgschema/pgschema",
      );
    }

    if (!dbmateInstalled) {
      throw new PostkitError(
        "dbmate binary not found.",
        "Install with: brew install dbmate  or  go install github.com/amacneil/dbmate@latest",
      );
    }

    logger.debug("Prerequisites check passed", options.verbose);

    // Step 2: Load configuration
    logger.step(2, 5, "Loading configuration...");

    const config = getConfig();

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
    logger.debug(
      `Local DB: ${maskConnectionUrl(config.localDbUrl)}`,
      options.verbose,
    );

    // Ensure .pgschemaignore exists in schema directory
    await ensurePgschemaIgnore(config.schemaPath);

    // Step 3: Test remote connection
    logger.step(3, 5, "Testing remote database connection...");
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

    // Step 4: Verify database state
    logger.step(4, 6, "Verifying database state...");

    // Check 1: Pending committed migrations
    const pendingCommitted = await getPendingCommittedMigrations();

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

    // Step 5: Clone database
    logger.step(4, 5, "Cloning remote database to local...");
    spinner.start("Cloning database (this may take a moment)...");

    if (options.dryRun) {
      spinner.info("Dry run - skipping database clone");
    } else {
      await cloneDatabase(targetRemoteUrl, config.localDbUrl);
      spinner.succeed("Database cloned successfully");

      const localTableCount = await getTableCount(config.localDbUrl);
      logger.info(`Local clone has ${localTableCount} tables`);
    }

    // Step 6: Create session
    logger.step(6, 6, "Creating session...");

    if (!options.dryRun) {
      const session = await createSession(
        targetRemoteUrl,
        config.localDbUrl,
        targetRemoteName,
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

function maskConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "****";
    return parsed.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ":****@");
  }
}
