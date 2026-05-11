import fs from "fs";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getComposeFilePath} from "../utils/stack-config";
import {composeLogs} from "../services/docker-compose";
import {PostkitError} from "../../../common/errors";

export interface LogsOptions extends CommandOptions {
  follow?: boolean;
  tail?: string;
}

export async function logsCommand(
  options: LogsOptions,
  service?: string,
): Promise<void> {
  const composeFile = getComposeFilePath();
  if (!fs.existsSync(composeFile)) {
    throw new PostkitError(
      "No stack found.",
      "Run 'postkit stack up' first to start the stack.",
    );
  }

  const follow = options.follow !== false;
  const tail = options.tail ? parseInt(options.tail, 10) : 100;

  logger.info(`Showing logs${service ? ` for ${service}` : ""}...`);
  logger.blank();

  await composeLogs(composeFile, service, {follow, tail});
}
