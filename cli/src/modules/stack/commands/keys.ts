import fs from "fs";
import ora from "ora";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getStackConfig} from "../utils/stack-config";
import {getComposeFilePath} from "../utils/stack-config";
import {fetchAndMergeKeys, writeKeysToSecrets} from "../services/keycloak-keys";
import {composeRestart} from "../services/docker-compose";
import {waitForAllServices} from "../services/health";

export interface KeysOptions extends CommandOptions {
  restart?: boolean;
  clients?: string;
}

export async function keysCommand(options: KeysOptions): Promise<void> {
  logger.heading("PostKit Stack Keys");

  // Check stack compose file exists (stack must have been started at least once)
  const composePath = getComposeFilePath();
  if (!fs.existsSync(composePath)) {
    logger.error("Stack is not running. Run 'postkit stack up' first.");
    return;
  }

  const config = getStackConfig();

  // Override clients from CLI flag if provided
  if (options.clients) {
    config.keycloakClients = options.clients
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const spinner = ora("Connecting to Keycloak...").start();
  try {
    const result = await fetchAndMergeKeys(config, spinner);
    spinner.succeed("Keys fetched from Keycloak");

    writeKeysToSecrets(result);
    logger.success("Secrets updated in postkit.secrets.json");

    // Summary
    logger.blank();
    logger.info(`RSA key fetched: ${result.jwk.kid ?? "unknown"}`);
    logger.info(`Total JWKS keys: ${result.jwks.keys.length}`);
    if (Object.keys(result.clients).length > 0) {
      logger.info("Client credentials:");
      for (const [name] of Object.entries(result.clients)) {
        logger.info(`  ${name}: secret + token fetched`);
      }
    }

    if (options.restart) {
      const restartSpinner = ora("Restarting PostgREST with updated JWKS...").start();
      // Re-read config with updated jwks and regenerate the compose file
      const updatedConfig = getStackConfig();
      const {writeComposeFile, ALL_SERVICES} = await import("../services/compose");
      writeComposeFile(updatedConfig, [...ALL_SERVICES]);
      await composeRestart(composePath, "postgrest");
      await waitForAllServices(updatedConfig, ["postgrest"], restartSpinner);
      restartSpinner.succeed("PostgREST restarted with updated JWKS");
    } else {
      logger.blank();
      logger.info("Run 'postkit stack restart postgrest' to apply JWKS to PostgREST.");
    }
  } catch (error) {
    spinner.fail("Failed to fetch keys from Keycloak");
    logger.error(String((error as Error).message));
  }
}
