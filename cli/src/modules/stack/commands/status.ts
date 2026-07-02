import fs from "fs";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getComposeFilePath} from "../utils/stack-config";
import {composeStatus} from "../services/docker-compose";
import {PostkitError} from "../../../common/errors";

export async function statusCommand(options: CommandOptions): Promise<void> {
  const composeFile = getComposeFilePath();
  if (!fs.existsSync(composeFile)) {
    throw new PostkitError(
      "No stack found.",
      "Run 'postkit stack up' first to start the stack.",
    );
  }

  const services = await composeStatus(composeFile);

  if (options.json) {
    console.log(JSON.stringify(services, null, 2));
    return;
  }

  if (services.length === 0) {
    logger.warn("No running services found. Run 'postkit stack up' to start the stack.");
    return;
  }

  logger.heading("PostKit Stack Status");
  logger.table(
    ["Service", "Container", "State", "Health", "Ports"],
    services.map((s) => [s.service, s.name, s.state, s.health, s.ports]),
  );
}
