import {spawn} from "child_process";
import {commandExists, runCommand} from "../../../common/shell";
import type {ShellResult} from "../../../common/types";
import {PostkitError} from "../../../common/errors";
import type {ServiceStatus} from "../types/config";

/**
 * Verify Docker and Docker Compose v2 are available.
 */
export async function checkDockerComposeAvailable(): Promise<void> {
  const installed = await commandExists("docker");
  if (!installed) {
    throw new PostkitError(
      "Docker not found.",
      "Install Docker Desktop from https://docker.com to use stack commands.",
    );
  }

  const result = await runCommand("docker info --format '{{.}}'", {timeout: 10000});
  if (result.exitCode !== 0) {
    throw new PostkitError(
      "Docker is not running.",
      "Start Docker Desktop and retry.",
    );
  }

  const composeResult = await runCommand("docker compose version", {timeout: 10000});
  if (composeResult.exitCode !== 0) {
    throw new PostkitError(
      "Docker Compose V2 is not available.",
      "Update Docker Desktop to get Docker Compose V2 (included by default).",
    );
  }
}

/**
 * Run `docker compose up -d` for selected services.
 */
export async function composeUp(
  composeFile: string,
  services: string[],
): Promise<ShellResult> {
  const args = ["compose", "-f", composeFile, "up", "-d", ...services];
  return runDockerCompose(args);
}

/**
 * Run `docker compose down` optionally removing volumes.
 */
export async function composeDown(
  composeFile: string,
  options?: {volumes?: boolean},
): Promise<ShellResult> {
  const args = ["compose", "-f", composeFile, "down"];
  if (options?.volumes) {
    args.push("--volumes");
  }
  return runDockerCompose(args);
}

/**
 * Run `docker compose ps --format json` and parse the result.
 */
export async function composeStatus(
  composeFile: string,
): Promise<ServiceStatus[]> {
  const result = await runDockerCompose([
    "compose", "-f", composeFile, "ps", "--format", "json",
  ]);

  if (result.exitCode !== 0) {
    return [];
  }

  return parseComposeStatus(result.stdout);
}

/**
 * Stream logs from docker compose. For follow mode, spawns a child process
 * that pipes directly to stdout/stderr (runs until Ctrl+C).
 * For non-follow mode, collects and returns.
 */
export async function composeLogs(
  composeFile: string,
  service?: string,
  options?: {follow?: boolean; tail?: number},
): Promise<void> {
  const args = ["compose", "-f", composeFile, "logs"];
  if (options?.tail) {
    args.push("--tail", String(options.tail));
  }
  if (options?.follow !== false) {
    args.push("--follow");
  }
  if (service) {
    args.push(service);
  }

  return new Promise((resolve) => {
    const child = spawn("docker", args, {
      stdio: ["ignore", "inherit", "inherit"],
    });

    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

/**
 * Restart specific services or all services.
 */
export async function composeRestart(
  composeFile: string,
  services?: string[],
): Promise<ShellResult> {
  const args = ["compose", "-f", composeFile, "restart"];
  if (services && services.length > 0) {
    args.push(...services);
  }
  return runDockerCompose(args);
}

/**
 * Parse `docker compose ps --format json` output into ServiceStatus[].
 * Docker Compose v2 outputs one JSON object per line (NDJSON).
 */
export function parseComposeStatus(output: string): ServiceStatus[] {
  const statuses: ServiceStatus[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const obj = JSON.parse(trimmed);
      // Docker Compose v2 format
      const health = obj.Health ?? obj.HealthStatus ?? "";
      const ports = obj.Publishers ?? obj.Ports ?? [];
      const port = Array.isArray(ports) && ports.length > 0
        ? (ports[0] as Record<string, unknown>).PublishedPort ?? (ports[0] as Record<string, unknown>).PublicPort ?? null
        : null;

      statuses.push({
        name: obj.Name ?? obj.Names ?? "",
        service: obj.Service ?? obj.Labels?.["com.docker.compose.service"] ?? "",
        state: obj.State ?? obj.Status ?? "",
        health: typeof health === "string" ? health : "",
        ports: formatPorts(ports),
        publisherPort: typeof port === "number" ? port : null,
      });
    } catch {
      // Skip unparseable lines
    }
  }

  return statuses;
}

// ============================================
// Internal Helpers
// ============================================

function runDockerCompose(args: string[]): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
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
  });
}

function formatPorts(ports: unknown): string {
  if (!Array.isArray(ports)) return "";
  return ports
    .map((p: Record<string, unknown>) => {
      const pub = p.PublishedPort ?? p.PublicPort;
      const priv = p.TargetPort ?? p.PrivatePort;
      if (pub && priv) return `${pub}:${priv}`;
      if (priv) return String(priv);
      return "";
    })
    .filter(Boolean)
    .join(", ");
}
