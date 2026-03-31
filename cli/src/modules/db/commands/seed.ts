import ora from "ora";
import {logger} from "../../../common/logger";
import {
  generateSeeds,
  getSeedsSQL,
  applySeeds,
} from "../services/seed-generator";
import {getSession} from "../utils/session";
import {testConnection} from "../services/database";
import type {CommandOptions} from "../../../common/types";

interface SeedOptions extends CommandOptions {
  apply?: boolean;
  target?: "local" | "remote";
}

export async function seedCommand(options: SeedOptions): Promise<void> {
  const spinner = ora();

  try {
    logger.heading("Seed Data");

    // Step 1: Generate seeds
    logger.step(1, 2, "Loading seed files...");
    spinner.start("Scanning for seed files...");

    const seeds = await generateSeeds();

    if (seeds.length === 0) {
      spinner.warn("No seed files found");
      logger.blank();
      logger.info("Seed files should be placed in:");
      logger.info("  - db/schema/seeds/");
      logger.info("  - db/schema/seed/");
      return;
    }

    spinner.succeed(`Found ${seeds.length} seed file(s)`);

    // Step 2: Display seeds
    logger.step(2, 2, "Generating seed statements...");

    const seedsSQL = await getSeedsSQL();

    logger.blank();
    logger.info("Seed Data Statements:");
    logger.blank();

    console.log(seedsSQL);

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
            "No active session. Cannot apply seeds to local database.",
          );
          logger.info('Run "postkit db start" first or use --target=remote.');
          process.exit(1);
        }
        targetUrl = session.localDbUrl;
        targetName = "local";
      }

      logger.info(`Applying seeds to ${targetName} database...`);
      spinner.start("Testing connection...");

      const connected = await testConnection(targetUrl);

      if (!connected) {
        spinner.fail(`Failed to connect to ${targetName} database`);
        process.exit(1);
      }

      spinner.succeed(`Connected to ${targetName} database`);

      if (options.dryRun) {
        spinner.info("Dry run - skipping seed application");
      } else {
        spinner.start("Applying seeds...");
        await applySeeds(targetUrl);
        spinner.succeed("Seeds applied successfully");
      }
    }

    logger.blank();
    logger.info("To apply these seeds:");
    logger.info('  - Run "postkit db seed --apply" to apply to local clone');
    logger.info(
      '  - Run "postkit db seed --apply --target=remote" to apply to remote',
    );
  } catch (error) {
    spinner.fail("Failed to generate seeds");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
