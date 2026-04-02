import ora from "ora";
import {logger} from "../../../common/logger";
import {getAuthConfig} from "../utils/auth-config";
import {
  getAdminToken,
  exportRealm,
  cleanRealmConfig,
  saveRawExport,
} from "../services/keycloak";
import type {CommandOptions} from "../../../common/types";

export async function exportCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    logger.heading("Keycloak Realm Export");

    // Step 1: Load config
    logger.step(1, 4, "Loading configuration...");
    const config = getAuthConfig();

    logger.info(`Source : ${config.sourceUrl}`);
    logger.info(`Realm  : ${config.sourceRealm}`);
    logger.blank();

    // Step 2: Acquire admin token
    logger.step(2, 4, "Acquiring admin token...");
    spinner.start("Authenticating with source Keycloak...");

    if (options.dryRun) {
      spinner.info("Dry run — skipping authentication");
    } else {
      const token = await getAdminToken(
        config.sourceUrl,
        config.sourceAdminUser,
        config.sourceAdminPass,
      );
      spinner.succeed("Token acquired");

      // Step 3: Export realm
      logger.step(3, 4, "Exporting realm...");
      spinner.start("Fetching realm configuration...");

      const rawExport = await exportRealm(
        config.sourceUrl,
        config.sourceRealm,
        token,
      );
      spinner.succeed("Realm exported");

      // Save raw export
      await saveRawExport(rawExport, config.rawFilePath);
      logger.debug(`Raw export saved: ${config.rawFilePath}`, options.verbose);

      // Step 4: Clean config
      logger.step(4, 4, "Cleaning configuration...");
      spinner.start("Stripping IDs, secrets, and credentials...");

      const cleaned = cleanRealmConfig(rawExport);
      await saveRawExport(cleaned, config.cleanFilePath);

      spinner.succeed("Config cleaned and saved");
    }

    logger.blank();
    logger.success("Export complete!");
    logger.blank();
    logger.info(`Raw    → ${config.rawFilePath}`);
    logger.info(`Clean  → ${config.cleanFilePath}`);
  } catch (error) {
    spinner.fail("Export failed");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
