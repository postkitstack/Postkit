import inquirer from "inquirer";
import {logger} from "./logger";

/**
 * Check if running in a TTY environment (interactive terminal)
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Prompt for confirmation with non-TTY handling
 * - With force flag: returns true immediately
 * - Non-TTY without force: returns true if default is true, otherwise throws Error
 */
export async function promptConfirm(
  message: string,
  options: {default?: boolean; force?: boolean} = {},
): Promise<boolean> {
  // 1. Force flag overrides everything and means "Proceed (YES)"
  if (options.force) {
    if (isInteractive()) {
      logger.info(`${message} Y (forced)`);
    }
    return true;
  }

  // 2. Non-interactive environments without force
  if (!isInteractive()) {
    if (options.default === true) {
      return true;
    }

    throw new Error(
      `Cannot prompt for confirmation in a non-interactive environment. Please use the --force flag to confirm: "${message}"`,
    );
  }

  // TTY: show prompt
  const {result} = await inquirer.prompt([
    {
      type: "confirm",
      name: "result",
      message,
      default: options.default,
    },
  ]);

  return result;
}

/**
 * Options for promptInput
 */
interface PromptInputOptions {
  default?: string;
  force?: boolean;
  required?: boolean;
}

/**
 * Prompt for input with non-TTY handling
 * In non-TTY mode:
 * - With force flag: returns default or empty string
 * - Without force: returns default or throws if required and no default
 */
export async function promptInput(
  message: string,
  options: PromptInputOptions = {},
): Promise<string> {
  // With force flag: use default without prompting
  if (options.force) {
    const defaultValue = options.default ?? "";
    if (isInteractive() && defaultValue) {
      logger.info(`${message} ${defaultValue}`);
    }
    return defaultValue;
  }

  // Non-interactive without force: return default or throw
  if (!isInteractive()) {
    if (options.required && options.default === undefined) {
      throw new Error(
        `Non-interactive mode requires a value for "${message}". ` +
          `Use --force with a default, or provide via CLI flag.`,
      );
    }
    return options.default ?? "";
  }

  // TTY: show prompt
  const {result} = await inquirer.prompt([
    {
      type: "input",
      name: "result",
      message,
      default: options.default,
      validate: (input: string) => {
        if (options.required && input.trim().length === 0) {
          return "This field is required";
        }
        return true;
      },
    },
  ]);

  return result.trim();
}
