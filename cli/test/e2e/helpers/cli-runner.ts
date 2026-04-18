import path from "path";
import {fileURLToPath} from "url";
import {execa, type Result} from "execa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve path to the built CLI binary (cli/dist/index.js)
// __dirname = cli/test/e2e/helpers/ → 3 levels up = cli/
const CLI_BIN = path.resolve(__dirname, "..", "..", "..", "dist", "index.js");

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
}

export interface CliRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

/**
 * Spawn the PostKit CLI as a child process and capture output.
 * Black-box E2E: tests the compiled binary, not internal modules.
 */
export async function runCli(
  args: string[],
  options: CliRunOptions = {},
): Promise<CliResult> {
  const timeout = options.timeout ?? 60_000;

  try {
    const result: Result = await execa("node", [CLI_BIN, ...args], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      timeout,
      reject: false,
    });

    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      exitCode: result.exitCode ?? 0,
      failed: result.failed,
    };
  } catch (error: unknown) {
    const err = error as Result;
    return {
      stdout: err.stdout?.trim() ?? "",
      stderr: err.stderr?.trim() ?? String(error),
      exitCode: err.exitCode ?? 1,
      failed: true,
    };
  }
}
