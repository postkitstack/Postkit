import ora from "ora";
import {logger} from "../../../common/logger";
import {
  loadInfra,
  getInfraSQL,
  applyInfra,
} from "../services/infra-generator";
import {getSession} from "../utils/session";
import {testConnection} from "../services/database";
import type {CommandOptions} from "../../../common/types";

interface InfraOptions extends CommandOptions {
  apply?: boolean;
  target?: "local" | "remote";
}

export async function infraCommand(options: InfraOptions): Promise<void> {
  const spinner = ora();

  try {
    logger.heading("Infrastructure Statements");

    // Step 1: Generate infra
    logger.step(1, 2, "Loading infra files...");
    spinner.start("Scanning for infra files...");

    const infra = await loadInfra();

    if (infra.length === 0) {
      spinner.warn("No infra files found");
      logger.blank();
      logger.info("Infra files should be placed in:");
      logger.info("  - db/schema/infra/");
      return;
    }

    spinner.succeed(`Found ${infra.length} infra file(s)`);

    // Step 2: Display infra
    logger.step(2, 2, "Generating infra statements...");

    const infraSQL = await getInfraSQL();

    logger.blank();
    logger.info("Generated Infrastructure Statements:");
    logger.blank();

    console.log(infraSQL);

    logger.blank();

    // Apply if requested
    if (options.apply) {
      const session = await getSession();
      let targetUrl: string | null = null;
      let targetName: string;

      if (options.target === "remote") {
        if (session) {
          targetUrl = session.remoteDbUrl;
        } else {
          const {resolveRemote} = await import("../utils/remotes");
          const {url} = resolveRemote();
          targetUrl = url;
        }
        targetName = "remote";
      } else {
        if (!session || !session.active) {
          logger.error(
            "No active session. Cannot apply infra to local database.",
          );
          logger.info('Run "postkit db start" first or use --target=remote.');
          process.exit(1);
        }
        targetUrl = session.localDbUrl;
        targetName = "local";
      }

      logger.info(`Applying infra to ${targetName} database...`);
      spinner.start("Testing connection...");

      const connected = await testConnection(targetUrl);

      if (!connected) {
        spinner.fail(`Failed to connect to ${targetName} database`);
        process.exit(1);
      }

      spinner.succeed(`Connected to ${targetName} database`);

      if (options.dryRun) {
        spinner.info("Dry run - skipping infra application");
      } else {
        spinner.start("Applying infra...");
        await applyInfra(targetUrl);
        spinner.succeed("Infra applied successfully");
      }
    }

    logger.blank();
    logger.info("To apply these infra statements:");
    logger.info('  - Run "postkit db infra --apply" to apply to local clone');
    logger.info(
      '  - Run "postkit db infra --apply --target=remote" to apply to remote',
    );
  } catch (error) {
    spinner.fail("Failed to generate infra statements");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
