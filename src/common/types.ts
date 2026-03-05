export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
}
