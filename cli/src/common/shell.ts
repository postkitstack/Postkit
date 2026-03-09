import {exec, spawn} from "child_process";
import {promisify} from "util";
import type {ShellResult} from "./types";

const execAsync = promisify(exec);

export async function runCommand(
  command: string,
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  } = {},
): Promise<ShellResult> {
  try {
    const {stdout, stderr} = await execAsync(command, {
      cwd: options.cwd,
      env: {...process.env, ...options.env},
      timeout: options.timeout || 300000, // 5 minute default timeout
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message: string;
    };
    return {
      stdout: execError.stdout?.trim() || "",
      stderr: execError.stderr?.trim() || execError.message,
      exitCode: execError.code || 1,
    };
  }
}

export async function runCommandWithInput(
  command: string,
  input: string,
  options: {
    cwd?: string;
    env?: Record<string, string>;
  } = {},
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(" ");
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: {...process.env, ...options.env},
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });

    child.on("error", (error) => {
      resolve({
        stdout: "",
        stderr: error.message,
        exitCode: 1,
      });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

export async function runSpawnCommand(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
  } = {},
): Promise<ShellResult> {
  const [cmd, ...rest] = args;
  return new Promise((resolve) => {
    const child = spawn(cmd, rest, {
      cwd: options.cwd,
      env: {...process.env, ...options.env},
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });

    child.on("error", (error) => {
      resolve({
        stdout: "",
        stderr: error.message,
        exitCode: 1,
      });
    });
  });
}

export async function commandExists(command: string): Promise<boolean> {
  const result = await runCommand(`which ${command}`);
  return result.exitCode === 0;
}
