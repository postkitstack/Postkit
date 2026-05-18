import fs from "fs";
import ora from "ora";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getComposeFilePath, getStackConfig} from "../utils/stack-config";
import {composeRestart} from "../services/docker-compose";
import {waitForAllServices} from "../services/health";
import {PostkitError} from "../../../common/errors";
import {ALL_SERVICES} from "../services/compose";
import type {ServiceName} from "../services/compose";

export async function restartCommand(
  options: CommandOptions,
  services: string[] = [],
): Promise<void> {
  const composeFile = getComposeFilePath();
  if (!fs.existsSync(composeFile)) {
    throw new PostkitError(
      "No stack found.",
      "Run 'postkit stack up' first to start the stack.",
    );
  }

  // Validate service names
  const valid = new Set<string>(ALL_SERVICES);
  const unknown = services.filter((s) => !valid.has(s));
  if (unknown.length > 0) {
    throw new PostkitError(
      `Unknown service(s): ${unknown.join(", ")}`,
      `Available services: ${ALL_SERVICES.join(", ")}`,
    );
  }

  const targets = services.length > 0
    ? (services as ServiceName[])
    : [...ALL_SERVICES];

  const label = targets.join(", ");

  if (options.dryRun) {
    logger.info(`Dry run: would restart ${label}`);
    return;
  }

  const spinner = ora(`Restarting: ${label}...`).start();

  const result = await composeRestart(composeFile, services.length > 0 ? services : undefined);

  if (result.exitCode !== 0) {
    spinner.fail(`Failed to restart ${label}`);
    logger.error(result.stderr);
    return;
  }

  spinner.succeed(`Restarted: ${label}`);

  // Health check the restarted services
  const config = getStackConfig();
  const healthSpinner = ora("Waiting for services to become healthy...").start();
  try {
    await waitForAllServices(config, targets, healthSpinner);
    healthSpinner.succeed(`${label} healthy`);
  } catch {
    healthSpinner.warn(`${label} restarted but may still be starting`);
  }
}
