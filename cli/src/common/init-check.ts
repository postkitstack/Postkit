import {checkInitialized} from "./config";
import {logger} from "./logger";
import {PostkitError} from "./errors";

/**
 * Wrapper to check initialization before running module commands.
 *
 * - PostkitError  → user-facing: log message + hint, exit with its exit code
 * - Anything else → programming bug: re-throw so unhandledRejection shows it
 */
export async function withInitCheck(fn: () => Promise<void>): Promise<void> {
  try {
    checkInitialized();
    await fn();
  } catch (error) {
    if (error instanceof PostkitError) {
      logger.error(error.message);
      if (error.hint) logger.info(error.hint);
      process.exit(error.exitCode);
    }
    // Unexpected error — re-throw so the unhandledRejection handler shows it
    throw error;
  }
}
