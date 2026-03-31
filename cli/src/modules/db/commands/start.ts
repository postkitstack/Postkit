import ora from "ora";
import inquirer from "inquirer";
import path from "path";
import {existsSync} from "fs";
import fs from "fs/promises";
import {logger} from "../../../common/logger";
import {getConfig} from "../utils/db-config";
import {createSession, hasActiveSession, getSession} from "../utils/session";
import {
  testConnection,
  cloneDatabase,
  getTableCount,
} from "../services/database";
import {checkPgschemaInstalled} from "../services/pgschema";
import {checkDbmateInstalled, runDbmateStatus} from "../services/dbmate";
import {getPendingCommittedMigrations} from "../utils/committed";
import type {CommandOptions} from "../../../common/types";

export async function startCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    // Check for existing session
    if (await hasActiveSession()) {
      const session = await getSession();
      logger.warn("An active migration session already exists.");
      logger.info(`Started at: ${session?.startedAt}`);
      logger.info(
        'Run "postkit db abort" to cancel it or "postkit db status" to see details.',
      );
      process.exit(1);
    }

    logger.heading("Starting Migration Session");

    // Step 1: Check prerequisites
    logger.step(1, 5, "Checking prerequisites...");

    const pgschemaInstalled = await checkPgschemaInstalled();
    const dbmateInstalled = await checkDbmateInstalled();

    if (!pgschemaInstalled) {
      logger.error("pgschema is not installed. Please install it first.");
      logger.info("Visit: https://github.com/pgschema/pgschema");
      process.exit(1);
    }

    if (!dbmateInstalled) {
      logger.error("dbmate is not installed. Please install it first.");
      logger.info(
        "Install with: brew install dbmate (macOS) or go install github.com/amacneil/dbmate@latest",
      );
      process.exit(1);
    }

    logger.debug("Prerequisites check passed", options.verbose);

    // Step 2: Load configuration
    logger.step(2, 5, "Loading configuration...");

    const config = getConfig();
    logger.debug(
      `Remote DB: ${maskConnectionUrl(config.remoteDbUrl)}`,
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

    const remoteConnected = await testConnection(config.remoteDbUrl);

    if (!remoteConnected) {
      spinner.fail("Failed to connect to remote database");
      logger.error(
        "Could not connect to the remote database. Check your REMOTE_DATABASE_URL.",
      );
      process.exit(1);
    }

    spinner.succeed("Connected to remote database");

    const remoteTableCount = await getTableCount(config.remoteDbUrl);
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
      logger.info('  1. Run "postkit db deploy --target=<env>" to deploy committed migrations');
      logger.info("  2. Then run \"postkit db start\" again");
      logger.blank();
      logger.info("If you want to discard committed migrations, manually delete .postkit/committed.json");
      process.exit(1);
    }

    spinner.succeed("No pending committed migrations");

    // Check 2: Run dbmate status to detect any pending migrations
    spinner.start("Checking migration status...");
    const statusOutput = await runDbmateStatus(config.remoteDbUrl);

    // Check if status output contains "Pending" migrations
    const hasPending = statusOutput.includes("Pending");

    if (hasPending) {
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
      if (!options.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Continue starting session despite pending migrations?",
            default: false,
          },
        ]);

        if (!confirm) {
          logger.info("Session start cancelled.");
          process.exit(0);
        }
      } else {
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
      await cloneDatabase(config.remoteDbUrl, config.localDbUrl);
      spinner.succeed("Database cloned successfully");

      const localTableCount = await getTableCount(config.localDbUrl);
      logger.info(`Local clone has ${localTableCount} tables`);
    }

    // Step 6: Create session
    logger.step(6, 6, "Creating session...");

    if (!options.dryRun) {
      const session = await createSession(
        config.remoteDbUrl,
        config.localDbUrl,
      );
      logger.success(`Session created (snapshot: ${session.remoteSnapshot})`);
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
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
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
