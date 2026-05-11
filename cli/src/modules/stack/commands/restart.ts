import fs from "fs";
import ora from "ora";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getComposeFilePath, getStackConfig} from "../utils/stack-config";
import {composeRestart} from "../services/docker-compose";
import {waitForAllServices} from "../services/health";
import {PostkitError} from "../../../common/errors";

export async function restartCommand(
  options: CommandOptions,
  service?: string,
): Promise<void> {
  const composeFile = getComposeFilePath();
  if (!fs.existsSync(composeFile)) {
    throw new PostkitError(
      "No stack found.",
      "Run 'postkit stack up' first to start the stack.",
    );
  }

  const label = service ?? "all services";
  const spinner = ora(`Restarting ${label}...`).start();

  const result = await composeRestart(composeFile, service);

  if (result.exitCode !== 0) {
    spinner.fail(`Failed to restart ${label}`);
    logger.error(result.stderr);
    return;
  }

  // Health check the restarted services
  const config = getStackConfig();
  const services = service ? [service] : ["postgres", "keycloak", "postgrest"];
  try {
    await waitForAllServices(config, services, spinner);
    spinner.succeed(`${label} restarted and healthy`);
  } catch {
    spinner.warn(`${label} restarted but may still be starting`);
  }
}
