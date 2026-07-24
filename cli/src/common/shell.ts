import {exec, spawn} from "child_process";
import {Transform} from "stream";
import {StringDecoder} from "string_decoder";
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

export async function runSpawnCommand(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    input?: string;
  } = {},
): Promise<ShellResult> {
  const cmd = args[0];
  const rest = args.slice(1);
  if (!cmd) {
    return {stdout: "", stderr: "No command specified", exitCode: 1};
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, rest, {
      cwd: options.cwd,
      env: {...process.env, ...options.env},
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });

    child.on("error", (error) => {
      resolve({
        stdout: "",
        stderr: error.message,
        exitCode: 1,
      });
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

export async function commandExists(command: string): Promise<boolean> {
  const check = process.platform === "win32" ? `where ${command}` : `which ${command}`;
  const result = await runCommand(check);
  return result.exitCode === 0;
}

export interface SpawnConfig {
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Buffers chunks and rewrites complete lines via `transformLine`, so a regex
 * match never straddles a chunk boundary. Partial trailing data is held until
 * the next chunk (or flushed as-is at stream end).
 *
 * Chunks are decoded via `StringDecoder` rather than `chunk.toString()` so a
 * multi-byte UTF-8 sequence split across a chunk boundary is buffered and
 * completed on the next chunk, instead of each half decoding independently
 * into replacement characters (`�`) and losing the original bytes.
 */
export function createLineTransform(transformLine: (line: string) => string): Transform {
  let buffer = "";
  const decoder = new StringDecoder("utf8");
  return new Transform({
    transform(chunk, _encoding, callback) {
      buffer += decoder.write(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        this.push(transformLine(line) + "\n");
      }
      callback();
    },
    flush(callback) {
      buffer += decoder.end();
      if (buffer) this.push(transformLine(buffer));
      callback();
    },
  });
}

/**
 * Spawns two processes and pipes stdout of the producer into stdin of the consumer.
 * Neither command is interpreted by a shell — args are passed directly to the OS.
 * Credentials should be supplied via the env field, never inline in args.
 *
 * `transformLine`, if given, rewrites each line of the producer's output before
 * it reaches the consumer's stdin (e.g. to patch pg_dump output before psql).
 */
export async function runPipedCommands(
  producer: SpawnConfig,
  consumer: SpawnConfig,
  transformLine?: (line: string) => string,
): Promise<ShellResult> {
  const producerCmd = producer.args[0];
  const producerArgs = producer.args.slice(1);
  const consumerCmd = consumer.args[0];
  const consumerArgs = consumer.args.slice(1);

  if (!producerCmd || !consumerCmd) {
    return Promise.resolve({stdout: "", stderr: "No command specified", exitCode: 1});
  }

  return new Promise((resolve) => {
    const src = spawn(producerCmd, producerArgs, {
      cwd: producer.cwd,
      env: {...process.env, ...producer.env},
      stdio: ["ignore", "pipe", "pipe"],
    });

    const dst = spawn(consumerCmd, consumerArgs, {
      cwd: consumer.cwd,
      env: {...process.env, ...consumer.env},
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (transformLine) {
      src.stdout.pipe(createLineTransform(transformLine)).pipe(dst.stdin);
    } else {
      src.stdout.pipe(dst.stdin);
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const done = (result: ShellResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    dst.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    src.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
    dst.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    // If the producer exits with an error, kill the consumer and report failure
    src.on("close", (code) => {
      if (code !== 0) {
        dst.kill();
        done({
          stdout: stdout.trim(),
          stderr: stderr.trim() || `Producer process exited with code ${code ?? 1}`,
          exitCode: code ?? 1,
        });
      }
    });

    dst.on("close", (code) => {
      done({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });

    src.on("error", (error) => {
      done({stdout: "", stderr: error.message, exitCode: 1});
    });

    dst.on("error", (error) => {
      done({stdout: "", stderr: error.message, exitCode: 1});
    });
  });
}
