import ora from "ora";
import {logger} from "../../../common/logger";
import {getAuthConfig} from "../utils/auth-config";
import {importRealm} from "../services/importer";
import type {CommandOptions} from "../../../common/types";

export async function importCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    logger.heading("Keycloak Realm Import");

    // Step 1: Load config
    logger.step(1, 2, "Loading configuration...");
    const config = getAuthConfig();

    logger.info(`Target : ${config.targetUrl}`);
    logger.info(`Config : ${config.cleanFilePath}`);
    logger.blank();

    // Step 2: Import via Docker
    logger.step(2, 2, "Importing via keycloak-config-cli...");

    if (options.dryRun) {
      spinner.info("Dry run — skipping import");
    } else {
      spinner.start("Running keycloak-config-cli Docker container...");
      await importRealm(config);
      spinner.succeed("Realm imported successfully");
    }

    logger.blank();
    logger.success("Import complete!");
  } catch (error) {
    spinner.fail("Import failed");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
