import ora from "ora";
import {Client} from "pg";
import type {StackConfig} from "../types/config";
import {applyInfraStep} from "../../db/services/infra-generator";
import {runCommittedMigrate} from "../../db/services/dbmate";
import {applySeedsStep} from "../../db/services/seed-generator";

const POSTKIT_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS postkit;
CREATE TABLE IF NOT EXISTS postkit.stack_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
`.trim();

export function buildPgUrl(config: StackConfig): string {
  return (
    `postgres://${config.postgres.user}:${encodeURIComponent(config.postgres.password)}` +
    `@localhost:${config.postgres.port}/${config.postgres.database}`
  );
}

async function connectWithRetry(pgUrl: string, retries = 10, delayMs = 2000): Promise<Client> {
  let last: Error | undefined;
  for (let i = 0; i < retries; i++) {
    const client = new Client({connectionString: pgUrl});
    try {
      await client.connect();
      return client;
    } catch (err) {
      last = err as Error;
      await client.end().catch(() => undefined);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last ?? new Error("Could not connect to postgres after retries");
}

export async function applyStackDeploy(
  config: StackConfig,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const pgUrl = buildPgUrl(config);

  // Wait until postgres is truly ready — pg_isready can pass before queries work
  spinner.start("Waiting for postgres to accept connections...");
  const client = await connectWithRetry(pgUrl);
  try {
    await client.query(POSTKIT_SCHEMA_SQL);
    spinner.succeed("postkit schema initialised");
  } finally {
    await client.end().catch(() => undefined);
  }

  // Phase 1: Apply db/infra/*.sql (roles, schemas, extensions)
  await applyInfraStep(spinner, pgUrl, "stack");

  // Phase 2: Apply committed migrations
  spinner.start("Running committed migrations...");
  const result = await runCommittedMigrate(pgUrl);
  if (!result.success) {
    const out = result.output ?? "";
    if (
      out.toLowerCase().includes("no migration files found") ||
      out.toLowerCase().includes("no migrations")
    ) {
      spinner.succeed("No committed migrations to apply");
    } else {
      throw new Error(`Migration failed: ${out}`);
    }
  } else {
    spinner.succeed("Committed migrations applied");
  }

  // Phase 3: Apply seeds
  await applySeedsStep(spinner, pgUrl, "stack");
}
