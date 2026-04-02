import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {
  getRemoteList,
  addRemote,
  removeRemote,
  setDefaultRemote,
  maskRemoteUrl,
} from "../utils/remotes";
import type {CommandOptions} from "../../../common/types";

interface RemoteAddOptions extends CommandOptions {
  default?: boolean;
}

interface RemoteRemoveOptions extends CommandOptions {
  force?: boolean;
}

interface RemoteUseOptions extends CommandOptions {}

/**
 * List all configured remotes
 */
export async function remoteListCommand(options: CommandOptions = {}): Promise<void> {
  try {
    const remotes = getRemoteList();

    if (remotes.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({remotes: []}));
        return;
      }
      logger.info("No remotes configured.");
      logger.blank();
      logger.info("Add a remote with:");
      logger.info('  postkit db remote add <name> <url>');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify({
        remotes: remotes.map(r => ({
          name: r.name,
          url: maskRemoteUrl(r.url),
          isDefault: r.isDefault,
          addedAt: r.addedAt,
        })),
      }));
      return;
    }

    logger.heading("Configured Remotes");
    logger.blank();

    for (const remote of remotes) {
      const defaultLabel = remote.isDefault ? " (default)" : "";
      logger.info(`${remote.name}${defaultLabel}`);
      logger.info(`  URL: ${maskRemoteUrl(remote.url)}`);

      if (remote.addedAt) {
        const addedDate = new Date(remote.addedAt).toLocaleDateString();
        logger.info(`  Added: ${addedDate}`);
      }

      logger.blank();
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Add a new remote
 */
export async function remoteAddCommand(
  options: RemoteAddOptions,
  name: string,
  url: string,
): Promise<void> {
  try {
    await addRemote(name, url, options.default);

    if (options.default) {
      logger.info(`Remote "${name}" is now the default`);
    } else {
      logger.info(`Set as default with: postkit db remote use ${name}`);
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Remove a remote
 */
export async function remoteRemoveCommand(
  options: RemoteRemoveOptions,
  name: string,
): Promise<void> {
  try {
    // If not forcing, confirm before removing
    if (!options.force) {
      const {confirm} = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Remove remote "${name}"?`,
          default: false,
        },
      ]);

      if (!confirm) {
        logger.info("Remove cancelled.");
        return;
      }
    }

    await removeRemote(name, options.force);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Set a remote as the default
 */
export async function remoteUseCommand(
  options: RemoteUseOptions,
  name: string,
): Promise<void> {
  try {
    await setDefaultRemote(name);
    logger.debug(`Default remote set to "${name}"`, options.verbose);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
