export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Base options available on every command via global flags.
 * Command-specific options should extend this interface:
 *   interface MyCommandOptions extends CommandOptions { myOption?: string }
 */
export interface CommandOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
}
