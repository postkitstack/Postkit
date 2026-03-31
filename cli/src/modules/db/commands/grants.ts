import ora from "ora";
import {logger} from "../../../common/logger";
import {
  generateGrants,
  getGrantsSQL,
  applyGrants,
} from "../services/grant-generator";
import {getSession} from "../utils/session";
import {testConnection} from "../services/database";
import type {CommandOptions} from "../../../common/types";

interface GrantsOptions extends CommandOptions {
  apply?: boolean;
  target?: "local" | "remote";
}

export async function grantsCommand(options: GrantsOptions): Promise<void> {
  const spinner = ora();

  try {
    logger.heading("Grant Statements");

    // Step 1: Generate grants
    logger.step(1, 2, "Loading grant files...");
    spinner.start("Scanning for grant files...");

    const grants = await generateGrants();

    if (grants.length === 0) {
      spinner.warn("No grant files found");
      logger.blank();
      logger.info("Grant files should be placed in:");
      logger.info("  - db/schema/grants/");
      logger.info("  - db/schema/policies/");
      return;
    }

    spinner.succeed(`Found ${grants.length} grant file(s)`);

    // Step 2: Display grants
    logger.step(2, 2, "Generating grant statements...");

    const grantsSQL = await getGrantsSQL();

    logger.blank();
    logger.info("Generated Grant Statements:");
    logger.blank();

    console.log(grantsSQL);

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
            "No active session. Cannot apply grants to local database.",
          );
          logger.info('Run "postkit db start" first or use --target=remote.');
          process.exit(1);
        }
        targetUrl = session.localDbUrl;
        targetName = "local";
      }

      logger.info(`Applying grants to ${targetName} database...`);
      spinner.start("Testing connection...");

      const connected = await testConnection(targetUrl);

      if (!connected) {
        spinner.fail(`Failed to connect to ${targetName} database`);
        process.exit(1);
      }

      spinner.succeed(`Connected to ${targetName} database`);

      if (options.dryRun) {
        spinner.info("Dry run - skipping grant application");
      } else {
        spinner.start("Applying grants...");
        await applyGrants(targetUrl);
        spinner.succeed("Grants applied successfully");
      }
    }

    logger.blank();
    logger.info("To apply these grants:");
    logger.info('  - Run "postkit db grants --apply" to apply to local clone');
    logger.info(
      '  - Run "postkit db grants --apply --target=remote" to apply to remote',
    );
  } catch (error) {
    spinner.fail("Failed to generate grants");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
