import ora from "ora";
import {logger} from "../../../common/logger";
import {getConfig} from "../utils/db-config";
import {createSession, hasActiveSession, getSession} from "../utils/session";
import {
  testConnection,
  cloneDatabase,
  getTableCount,
} from "../services/database";
import {checkPgschemaInstalled} from "../services/pgschema";
import {checkDbmateInstalled} from "../services/dbmate";
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

    // Step 4: Clone database
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

    // Step 5: Create session
    logger.step(5, 5, "Creating session...");

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

function maskConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "****";
    return parsed.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ":****@");
  }
}
