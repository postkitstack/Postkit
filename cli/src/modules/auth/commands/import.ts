import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {promptConfirm} from "../../../common/prompt";
import {getAuthConfig} from "../utils/auth-config";
import {importRealm} from "../services/importer";
import type {CommandOptions} from "../../../common/types";

export async function importCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    logger.heading("Keycloak Realm Import");

    // Step 1: Load config
    logger.step(1, 3, "Loading configuration...");
    const config = getAuthConfig();

    logger.info(`Target : ${config.targetUrl}`);
    logger.info(`Config : ${config.cleanFilePath}`);
    logger.blank();

    // Step 2: Confirm import (unless force flag)
    logger.step(2, 3, "Confirming import...");
    const confirmed = await promptConfirm(
      `Import realm config to ${config.targetUrl}?`,
      {default: false, force: options.force},
    );

    if (!confirmed) {
      logger.info("Import cancelled.");
      return;
    }

    if (options.force) {
      logger.info("Skipping confirmation (--force)");
    }

    // Step 3: Import via Docker
    logger.step(3, 3, "Importing via keycloak-config-cli...");
    spinner.start("Running keycloak-config-cli Docker container...");
    await importRealm(config);
    spinner.succeed("Realm imported successfully");

    logger.blank();
    logger.success("Import complete!");
  } catch (error) {
    spinner.fail("Import failed");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
