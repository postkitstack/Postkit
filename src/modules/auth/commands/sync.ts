import {logger} from "../../../common/logger";
import {exportCommand} from "./export";
import {importCommand} from "./import";
import type {CommandOptions} from "../../../common/types";

export async function syncCommand(options: CommandOptions): Promise<void> {
  try {
    logger.heading("Keycloak Realm Sync (Export + Import)");
    logger.blank();

    // Step 1: Export
    await exportCommand(options);

    logger.blank();

    // Step 2: Import
    await importCommand(options);

    logger.blank();
    logger.success("Sync complete! Realm exported and imported successfully.");
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
