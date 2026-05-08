import ora from "ora";
import {logger} from "../../../common/logger";
import {
  loadSeeds,
  getSeedsSQL,
  applySeeds,
} from "../services/seed-generator";
import {testConnection} from "../services/database";
import {resolveApplyTarget} from "../utils/apply-target";
import type {CommandOptions} from "../../../common/types";

interface SeedOptions extends CommandOptions {
  apply?: boolean;
  target?: string;
}

export async function seedCommand(options: SeedOptions): Promise<void> {
  const spinner = ora();

  try {
    logger.heading("Seed Data");

    // Step 1: Generate seeds
    logger.step(1, 2, "Loading seed files...");
    spinner.start("Scanning for seed files...");

    const seeds = await loadSeeds();

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
      const target = await resolveApplyTarget(options.target);

      logger.info(`Applying seeds to ${target.label} database...`);
      spinner.start("Testing connection...");

      const connected = await testConnection(target.url);

      if (!connected) {
        spinner.fail(`Failed to connect to ${target.label} database`);
        throw new Error(`Could not connect to ${target.label} database`);
      }

      spinner.succeed(`Connected to ${target.label} database`);

      if (options.dryRun) {
        spinner.info("Dry run - skipping seed application");
      } else {
        spinner.start("Applying seeds...");
        await applySeeds(target.url);
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
    throw error;
  }
}
