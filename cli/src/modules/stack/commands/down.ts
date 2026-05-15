import fs from "fs";
import ora from "ora";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getComposeFilePath} from "../utils/stack-config";
import {composeDown} from "../services/docker-compose";
import {PostkitError} from "../../../common/errors";

export interface DownOptions extends CommandOptions {
  volumes?: boolean;
}

export async function downCommand(options: DownOptions): Promise<void> {
  logger.heading("PostKit Stack Down");

  const composeFile = getComposeFilePath();
  if (!fs.existsSync(composeFile)) {
    throw new PostkitError(
      "No stack found.",
      "Run 'postkit stack up' first to start the stack.",
    );
  }

  const spinner = ora("Stopping stack services...").start();
  const result = await composeDown(composeFile, {volumes: options.volumes});

  if (result.exitCode !== 0) {
    spinner.fail("Failed to stop services");
    logger.error(result.stderr);
    return;
  }

  spinner.succeed(options.volumes
    ? "Stack stopped and volumes removed"
    : "Stack stopped",
  );

  logger.blank();
  if (options.volumes) {
    logger.info("Containers and volumes removed. All data has been deleted.");
  } else {
    logger.info("Containers removed. Data preserved in Docker volumes.");
    logger.info("Use --volumes to remove persistent data as well.");
  }
}
