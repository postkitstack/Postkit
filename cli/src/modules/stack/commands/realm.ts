import fs from "fs";
import ora from "ora";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getStackConfig, getComposeFilePath} from "../utils/stack-config";
import {importRealmTemplate} from "../services/realm-init";

export async function realmCommand(options: CommandOptions): Promise<void> {
  logger.heading("PostKit Stack Realm Init");

  if (!fs.existsSync(getComposeFilePath())) {
    logger.error("Stack is not running. Run 'postkit stack up' first.");
    return;
  }

  const config = getStackConfig();

  if (!config.keycloak.realmTemplate) {
    logger.error(
      "No realm template configured. Add stack.keycloak.realmTemplate to postkit.config.json.",
    );
    return;
  }

  const spinner = ora("Importing realm template into Keycloak...").start();
  try {
    await importRealmTemplate(config, spinner);
    spinner.succeed(`Realm "${config.keycloak.realm}" imported successfully`);
    logger.blank();
    logger.success("Realm initialised!");
  } catch (error) {
    spinner.fail("Realm import failed");
    logger.error(String((error as Error).message));
  }
}
