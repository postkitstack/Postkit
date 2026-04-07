import ora from "ora";
import {logger} from "../../../common/logger";
import {promptConfirm} from "../../../common/prompt";
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

    // Step 2: Confirm export (unless force flag)
    logger.step(2, 4, "Confirming export...");
    const confirmed = await promptConfirm(
      `Export realm "${config.sourceRealm}" from ${config.sourceUrl}?`,
      {default: true, force: options.force},
    );

    if (!confirmed) {
      logger.info("Export cancelled.");
      return;
    }

    if (options.force) {
      logger.info("Skipping confirmation (--force)");
    }

    // Step 3: Acquire admin token
    logger.step(3, 4, "Acquiring admin token...");
    spinner.start("Authenticating with source Keycloak...");

    const token = await getAdminToken(
      config.sourceUrl,
      config.sourceAdminUser,
      config.sourceAdminPass,
    );
    spinner.succeed("Token acquired");

    // Step 4: Export and clean
    logger.step(4, 4, "Exporting and cleaning realm...");
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

    // Clean config
    spinner.start("Stripping IDs, secrets, and credentials...");
    const cleaned = cleanRealmConfig(rawExport);
    await saveRawExport(cleaned, config.cleanFilePath);
    spinner.succeed("Config cleaned and saved");

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
