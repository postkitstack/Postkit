import ora from "ora";
import {Client} from "pg";
import type {StackConfig} from "../types/config";
import {applyInfraStep} from "../../db/services/infra-generator";
import {runCommittedMigrate} from "../../db/services/dbmate";

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

export async function applyStackDeploy(
  config: StackConfig,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const pgUrl = buildPgUrl(config);

  // Ensure postkit internal schema + stack_config table exist
  spinner.start("Initialising postkit schema...");
  const client = new Client({connectionString: pgUrl});
  await client.connect();
  try {
    await client.query(POSTKIT_SCHEMA_SQL);
  } finally {
    await client.end();
  }

  // Apply db/infra/*.sql (roles, schemas, extensions)
  await applyInfraStep(spinner, pgUrl, "stack");

  // Apply all committed migrations — no dry-run, no cloning
  spinner.start("Running committed migrations on stack...");
  const result = await runCommittedMigrate(pgUrl);
  if (!result.success) {
    const out = result.output ?? "";
    if (out.toLowerCase().includes("no migration files found") || out.toLowerCase().includes("no migrations")) {
      spinner.succeed("No committed migrations to apply");
      return;
    }
    throw new Error(`Migration failed: ${out}`);
  }
  spinner.succeed("Committed migrations applied to stack");
}
