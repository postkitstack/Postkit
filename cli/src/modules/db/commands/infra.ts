import ora from "ora";
import {logger} from "../../../common/logger";
import {
  loadInfra,
  getInfraSQL,
  applyInfra,
} from "../services/infra-generator";
import {testConnection} from "../services/database";
import {resolveApplyTarget} from "../utils/apply-target";
import type {CommandOptions} from "../../../common/types";

interface InfraOptions extends CommandOptions {
  apply?: boolean;
  target?: string;
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
      const target = await resolveApplyTarget(options.target);

      logger.info(`Applying infra to ${target.label} database...`);
      spinner.start("Testing connection...");

      const connected = await testConnection(target.url);

      if (!connected) {
        spinner.fail(`Failed to connect to ${target.label} database`);
        throw new Error(`Could not connect to ${target.label} database`);
      }

      spinner.succeed(`Connected to ${target.label} database`);

      if (options.dryRun) {
        spinner.info("Dry run - skipping infra application");
      } else {
        spinner.start("Applying infra...");
        await applyInfra(target.url);
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
    throw error;
  }
}
