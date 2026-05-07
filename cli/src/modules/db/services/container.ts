import net from "net";
import {runCommand, runSpawnCommand, commandExists} from "../../../common/shell";
import {testConnection} from "./database";
import {PostkitError} from "../../../common/errors";

const POSTGRES_IMAGE = "postgres:16-alpine";
const CONTAINER_PREFIX = "postkit-session";
const DB_NAME = "postkit_local";
const DB_USER = "postgres";
const DB_PASSWORD = "postkit_local";

export interface ContainerInfo {
  containerID: string;
  localDbUrl: string;
  port: number;
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

export async function startSessionContainer(): Promise<ContainerInfo> {
  const port = await findFreePort(15432, 15532);
  const containerName = `${CONTAINER_PREFIX}-${Date.now()}`;

  const result = await runSpawnCommand([
    "docker", "run", "-d",
    "--name", containerName,
    "-p", `${port}:5432`,
    "-e", `POSTGRES_PASSWORD=${DB_PASSWORD}`,
    "-e", `POSTGRES_DB=${DB_NAME}`,
    "-e", `POSTGRES_USER=${DB_USER}`,
    POSTGRES_IMAGE,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to start Postgres container: ${result.stderr}`);
  }

  const containerID = result.stdout.trim();
  const localDbUrl = `postgres://${DB_USER}:${DB_PASSWORD}@localhost:${port}/${DB_NAME}`;

  await waitForPostgres(localDbUrl);
  return {containerID, localDbUrl, port};
}

export async function stopSessionContainer(containerID: string): Promise<void> {
  await runCommand(`docker stop ${containerID}`);
  await runCommand(`docker rm ${containerID}`);
}

async function waitForPostgres(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await testConnection(url)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Postgres container did not become ready within 30 seconds.");
}

async function findFreePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found between ${start} and ${end}.`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port);
  });
}
