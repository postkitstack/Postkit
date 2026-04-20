import fs from "fs/promises";
import path from "path";
import {expect} from "vitest";
import {runCli} from "./cli-runner";
import type {TestProject} from "./test-project";
import type {TestDatabase} from "./test-database";
import {queryDatabase} from "./db-query";
import {FIXTURE_TABLES} from "./schema-builder";

// ---------------------------------------------------------------------------
// CLI workflow actions
// ---------------------------------------------------------------------------

/** Run `db start --force` and verify it succeeds */
export async function startSession(project: TestProject): Promise<void> {
  const result = await runCli(["db", "start", "--force"], {
    cwd: project.rootDir,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Migration session started");
}

/** Run `db plan` and verify it succeeds */
export async function runPlan(project: TestProject): Promise<string> {
  const result = await runCli(["db", "plan"], {cwd: project.rootDir});
  expect(result.exitCode).toBe(0);
  return result.stdout;
}

/** Run `db apply --force` and verify it succeeds */
export async function runApply(project: TestProject): Promise<void> {
  const result = await runCli(["db", "apply", "--force"], {
    cwd: project.rootDir,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("applied");
}

/** Run `db commit --force --message <msg>` and verify it succeeds */
export async function runCommit(
  project: TestProject,
  message: string,
): Promise<void> {
  const result = await runCli(
    ["db", "commit", "--force", "--message", message],
    {cwd: project.rootDir},
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("committed");
}

/** Run `db deploy --force` and verify it succeeds */
export async function runDeploy(
  project: TestProject,
  timeout = 120_000,
): Promise<void> {
  const result = await runCli(["db", "deploy", "--force"], {
    cwd: project.rootDir,
    timeout,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("completed");
}

/** Run `db status --json` and return parsed status */
export async function getStatus(
  project: TestProject,
): Promise<Record<string, unknown>> {
  const result = await runCli(["db", "status", "--json"], {
    cwd: project.rootDir,
  });
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout);
}

/** Run `db migration <name> --force` and inject SQL into the template placeholder */
export async function createManualMigration(
  project: TestProject,
  name: string,
  sql: string,
): Promise<void> {
  // List existing files before creating the new one
  const sessionDir = path.join(project.dbDir, "session");
  const filesBefore = await fs.readdir(sessionDir);
  const sqlBefore = new Set(filesBefore.filter((f) => f.endsWith(".sql")));

  // Wait 1 second to ensure dbmate timestamp is unique (dbmate uses second-precision)
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const result = await runCli(["db", "migration", name, "--force"], {
    cwd: project.rootDir,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Manual migration created");

  // Find the NEW file (not present before the command)
  const filesAfter = await fs.readdir(sessionDir);
  const newFiles = filesAfter.filter(
    (f) => f.endsWith(".sql") && !sqlBefore.has(f),
  );
  expect(newFiles.length, "Expected exactly 1 new migration file").toBe(1);

  const migrationPath = path.join(sessionDir, newFiles[0]!);
  let content = await fs.readFile(migrationPath, "utf-8");

  // Replace the placeholder "-- Add your SQL migration here..." with actual SQL
  // Keeps -- migrate:up, SET search_path, and -- migrate:down intact
  content = content.replace(
    /-- Add your SQL migration here[\s\S]*?(?=\n-- migrate:down)/,
    sql,
  );

  await fs.writeFile(migrationPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Database verification helpers
// ---------------------------------------------------------------------------

/** Verify that all specified tables exist in the database */
export async function verifyTablesExist(
  dbUrl: string,
  tables: readonly string[],
  label = "DB",
): Promise<void> {
  for (const table of tables) {
    const rows = await queryDatabase(
      dbUrl,
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      [table],
    );
    expect(
      rows[0]?.exists,
      `Table '${table}' should exist in ${label}`,
    ).toBe(true);
  }
}

/** Verify that all specified tables have RLS enabled */
export async function verifyRlsEnabled(
  dbUrl: string,
  tables: readonly string[],
  label = "DB",
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT tablename, rowsecurity FROM pg_tables
     WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [tables as unknown as string[]],
  );
  for (const row of rows) {
    const {tablename, rowsecurity} = row as {
      tablename: string;
      rowsecurity: boolean;
    };
    expect(
      rowsecurity,
      `Table '${tablename}' should have RLS enabled in ${label}`,
    ).toBe(true);
  }
}

/** Verify that specific triggers exist in the database */
export async function verifyTriggersExist(
  dbUrl: string,
  triggerNames: string[],
  label = "DB",
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT trigger_name FROM information_schema.triggers
     WHERE trigger_schema = 'public'
     ORDER BY trigger_name`,
  );
  const found = rows.map((r) => (r as {trigger_name: string}).trigger_name);
  for (const name of triggerNames) {
    expect(found, `Trigger '${name}' should exist in ${label}`).toContain(name);
  }
}

/** Verify that specific functions exist in the database */
export async function verifyFunctionsExist(
  dbUrl: string,
  functionNames: string[],
  label = "DB",
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT routine_name FROM information_schema.routines
     WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
       AND routine_name = ANY($1)`,
    [functionNames],
  );
  const found = rows.map(
    (r) => (r as {routine_name: string}).routine_name,
  );
  for (const name of functionNames) {
    expect(
      found,
      `Function '${name}' should exist in ${label}`,
    ).toContain(name);
  }
}

/** Verify that specific views exist in the database */
export async function verifyViewsExist(
  dbUrl: string,
  viewNames: string[],
  label = "DB",
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT table_name FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [viewNames],
  );
  const found = rows.map((r) => (r as {table_name: string}).table_name);
  for (const name of viewNames) {
    expect(found, `View '${name}' should exist in ${label}`).toContain(name);
  }
}

/** Verify indexes exist on a specific table */
export async function verifyIndexesExist(
  dbUrl: string,
  tableName: string,
  indexNames: string[],
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT indexname FROM pg_indexes
     WHERE tablename = $1 AND schemaname = 'public'`,
    [tableName],
  );
  const found = rows.map((r) => (r as {indexname: string}).indexname);
  for (const name of indexNames) {
    expect(found, `Index '${name}' should exist on '${tableName}'`).toContain(
      name,
    );
  }
}

/** Verify the full fixture schema exists in the database */
export async function verifyFixtureSchema(
  dbUrl: string,
  label = "DB",
): Promise<void> {
  await verifyTablesExist(dbUrl, FIXTURE_TABLES, label);
  await verifyRlsEnabled(dbUrl, FIXTURE_TABLES, label);
  await verifyTriggersExist(
    dbUrl,
    ["update_category_timestamp", "update_product_timestamp"],
    label,
  );
  await verifyFunctionsExist(
    dbUrl,
    ["update_updated_at", "get_products_by_category"],
    label,
  );
  await verifyViewsExist(dbUrl, ["products_with_category"], label);
}
