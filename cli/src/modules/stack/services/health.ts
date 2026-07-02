import http from "http";
import net from "net";
import type {Ora} from "ora";
import type {StackConfig} from "../types/config";

const DEFAULT_MAX_ATTEMPTS = 60;
const RETRY_DELAY_MS = 2000;

/**
 * Wait for a TCP connection to become available (used for PostgreSQL).
 */
export async function waitForPostgres(
  host: string,
  port: number,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isTcpReachable(host, port)) return;
    await sleep(RETRY_DELAY_MS);
  }
  throw new Error(`PostgreSQL at ${host}:${port} did not become ready within ${maxAttempts * RETRY_DELAY_MS / 1000}s`);
}

/**
 * Wait for an HTTP health endpoint to return 2xx.
 */
export async function waitForHttp(
  url: string,
  serviceName: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const ok = await httpGetOk(url);
      if (ok) return;
    } catch {
      // Connection refused / reset — service not up yet
    }
    await sleep(RETRY_DELAY_MS);
  }
  throw new Error(`${serviceName} at ${url} did not become ready within ${maxAttempts * RETRY_DELAY_MS / 1000}s`);
}

/**
 * Wait for all started services to become healthy.
 * Updates the spinner with progress as services become ready.
 */
export async function waitForAllServices(
  config: StackConfig,
  services: string[],
  spinner: Ora,
): Promise<void> {
  const checks: Promise<void>[] = [];

  for (const service of services) {
    switch (service) {
      case "postgres": {
        const check = waitForPostgres("localhost", config.postgres.port)
          .then(() => { spinner.text = `${spinner.text} (postgres ready)`; });
        checks.push(check);
        break;
      }
      case "keycloak": {
        const url = `http://keycloak.localhost/realms/master`;
        const check = waitForHttp(url, "Keycloak")
          .then(() => { spinner.text = `${spinner.text} (keycloak ready)`; });
        checks.push(check);
        break;
      }
      case "postgrest": {
        const url = `http://api.localhost/`;
        const check = waitForHttp(url, "PostgREST")
          .then(() => { spinner.text = `${spinner.text} (postgrest ready)`; });
        checks.push(check);
        break;
      }
      case "traefik": {
        const url = `http://localhost:${config.traefik.dashboardPort}/dashboard/`;
        const check = waitForHttp(url, "Traefik")
          .then(() => { spinner.text = `${spinner.text} (traefik ready)`; });
        checks.push(check);
        break;
      }
    }
  }

  await Promise.all(checks);
}

// ============================================
// Internal Helpers
// ============================================

function isTcpReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({host, port});
    socket.setTimeout(2000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function httpGetOk(url: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, {timeout: 3000}, (res) => {
      res.resume(); // drain the response
      // Accept 1xx–4xx; reject 5xx (e.g. Traefik 502 when backend not ready yet)
      resolve(res.statusCode !== undefined && res.statusCode > 0 && res.statusCode < 500);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
