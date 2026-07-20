import net from "net";
import type {Ora} from "ora";
import {runCommand, runSpawnCommand, commandExists} from "../../../common/shell";
import {testConnection, parseConnectionUrl, getRemotePgMajorVersion, sanitizeCloneLine} from "./database";
import {runPipedCommands} from "../../../common/shell";
import {PostkitError} from "../../../common/errors";

const CONTAINER_PREFIX = "postkit-session";
const DB_NAME = "postkit_local";
const DB_USER = "postgres";
const DB_PASSWORD = "postkit_local";

export interface ContainerInfo {
  containerID: string;
  localDbUrl: string;
  port: number;
  pgVersion: number;
}

export async function checkDockerAvailable(): Promise<void> {
  const installed = await commandExists("docker");
  if (!installed) {
    throw new PostkitError(
      "Docker not found.",
      "Install Docker Desktop from https://docker.com or set localDbUrl in postkit.secrets.json to use an existing database.",
    );
  }
  const result = await runCommand("docker info");
  if (result.exitCode !== 0) {
    throw new PostkitError(
      "Docker is not running.",
      "Start Docker Desktop and retry. Or set localDbUrl in postkit.secrets.json to use an existing database.",
    );
  }
}

/**
 * Start a Postgres container whose version matches the remote database.
 * This ensures pg_dump (run inside the container) is always version-compatible.
 */
export async function startSessionContainer(pgVersion: number): Promise<ContainerInfo> {
  const port = await findFreePort(15432, 15532);
  const containerName = `${CONTAINER_PREFIX}-${Date.now()}`;
  const image = `postgres:${pgVersion}-alpine`;

  const result = await runSpawnCommand([
    "docker", "run", "-d",
    "--name", containerName,
    "-p", `${port}:5432`,
    "-e", `POSTGRES_PASSWORD=${DB_PASSWORD}`,
    "-e", `POSTGRES_DB=${DB_NAME}`,
    "-e", `POSTGRES_USER=${DB_USER}`,
    image,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to start postgres:${pgVersion}-alpine container: ${result.stderr}`);
  }

  const containerID = result.stdout.trim();
  const localDbUrl = `postgres://${DB_USER}:${DB_PASSWORD}@localhost:${port}/${DB_NAME}?sslmode=disable`;

  await waitForPostgres(localDbUrl);
  return {containerID, localDbUrl, port, pgVersion};
}

export async function stopSessionContainer(containerID: string): Promise<void> {
  await runCommand(`docker stop ${containerID}`);
  await runCommand(`docker rm ${containerID}`);
}

export interface ResolvedLocalDb {
  url: string;
  containerID?: string;
}

/**
 * Resolve the local database URL.
 * If localDbUrl is already set, return it directly without touching Docker.
 * If empty, detect the remote PG version, check Docker availability, and start
 * a version-matched container. The caller is responsible for stopping it via containerID.
 */
export async function resolveLocalDb(
  localDbUrl: string,
  remoteUrl: string,
  spinner: Ora,
  spinnerText?: string,
): Promise<ResolvedLocalDb> {
  if (localDbUrl) {
    return {url: localDbUrl};
  }
  spinner.start("Checking Docker availability...");
  await checkDockerAvailable();
  spinner.text = "Detecting remote PostgreSQL version...";
  const pgVersion = await getRemotePgMajorVersion(remoteUrl);
  spinner.text = spinnerText ?? `Starting postgres:${pgVersion}-alpine container...`;
  const container = await startSessionContainer(pgVersion);
  spinner.succeed(`Postgres ${pgVersion} container started on port ${container.port}`);
  return {url: container.localDbUrl, containerID: container.containerID};
}

/**
 * Clone sourceUrl into the container's local database by running pg_dump and psql
 * *inside* the container. This guarantees the dump tools always match the remote's
 * PostgreSQL version — no host binary version mismatch possible.
 *
 * pg_dump  → runs inside container, connects to remote externally  (version = remote)
 * psql     → runs inside container, connects to localhost:5432      (version = remote)
 */
/**
 * When pg_dump runs inside a Docker container, "localhost" / "127.0.0.1" refer
 * to the container's own loopback — not the host machine. Remap them to the
 * Docker-internal hostname that routes back to the host on macOS/Windows/Linux.
 */
function toDockerHost(host: string): string {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "host.docker.internal";
  }
  return host;
}

export async function cloneDatabaseViaContainer(
  containerID: string,
  sourceUrl: string,
  targetUrl: string,
  schemaOnly = false,
): Promise<void> {
  const src = parseConnectionUrl(sourceUrl);
  const dst = parseConnectionUrl(targetUrl);
  const srcHost = toDockerHost(src.host);

  const result = await runPipedCommands(
    {
      args: [
        "docker", "exec",
        "-e", `PGPASSWORD=${src.password}`,
        "-i", containerID,
        "pg_dump",
        "-h", srcHost,
        "-p", String(src.port),
        "-U", src.user,
        "-d", src.database,
        "--no-owner",
        ...(schemaOnly ? ["--schema-only"] : []),
      ],
    },
    {
      args: [
        "docker", "exec",
        "-e", `PGPASSWORD=${dst.password}`,
        "-i", containerID,
        "psql",
        "-h", "localhost",
        "-p", "5432",        // internal port — always 5432 inside the container
        "-U", dst.user,
        "-d", dst.database,
        "-v", "ON_ERROR_STOP=1",
      ],
    },
    sanitizeCloneLine,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to clone database via container: ${result.stderr}`);
  }
}

async function waitForPostgres(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await testConnection(url)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Postgres container did not become ready within 30 seconds.");
}

/**
 * Register SIGINT/SIGTERM handlers to stop a container when the process is interrupted.
 * Returns a deregister function — call it once the container is no longer your responsibility.
 */
export function onContainerInterrupt(containerID: string): () => void {
  const handler = () => {
    stopSessionContainer(containerID).finally(() => process.exit(130));
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
  return () => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
}

async function findFreePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(
    `No free port found between ${start} and ${end}. ` +
    `Run: docker ps --filter name=${CONTAINER_PREFIX} to check for leftover containers.`,
  );
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port);
  });
}
