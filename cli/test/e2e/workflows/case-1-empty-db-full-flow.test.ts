import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {
  createTestProject,
  cleanupTestProject,
  type TestProject,
  fileExists,
} from "../helpers/test-project";
import {
  startPostgresPair,
  stopPostgresPair,
  type TestDatabase,
} from "../helpers/test-database";
import {
  tableExists,
  queryDatabase,
  ensureDatabaseExists,
} from "../helpers/db-query";
import {installFixtureSchema, FIXTURE_TABLES} from "../helpers/schema-builder";

/**
 * Case 1: Initial Empty DB
 *
 * Both local and remote start completely empty.
 * The fixture schema files define the desired state.
 *
 * Flow: start → plan → apply → commit → deploy (remote)
 */
describe("Case 1: Empty DB — start → plan → apply → commit → deploy", () => {
  let localDb: TestDatabase;
  let remoteDb: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    const {local, remote} = await startPostgresPair();
    localDb = local;
    remoteDb = remote;

    project = await createTestProject({
      localDbUrl: localDb.url,
      remoteDbUrl: remoteDb.url,
      remoteName: "dev",
    });

    // Install the full fixture schema into the project's schema directory
    // (category + product with RLS, grants, triggers, functions, views, seeds, infra)
    await installFixtureSchema(project);
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (localDb || remoteDb)
      await stopPostgresPair({local: localDb, remote: remoteDb});
  });

  // ── Step 1: Start session ───────────────────────────────────────────

  it("starts a migration session from empty remote", async () => {
    const result = await runCli(["db", "start", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(true);
  });

  it("shows active session in status --json", async () => {
    const result = await runCli(["db", "status", "--json"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.sessionActive).toBe(true);
  });

  // ── Step 2: Plan ────────────────────────────────────────────────────

  it("generates a plan from empty DB to fixture schema", async () => {
    const result = await runCli(["db", "plan"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("category");
    expect(result.stdout).toContain("product");
  });

  // ── Step 3: Apply ───────────────────────────────────────────────────

  it("applies the plan to local database", async () => {
    const result = await runCli(["db", "apply", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies fixture tables exist in local DB", async () => {
    for (const table of FIXTURE_TABLES) {
      const exists = await tableExists(localDb.url, table);
      expect(exists, `Table '${table}' should exist in local DB`).toBe(true);
    }
  });

  it("verifies RLS is enabled on local tables", async () => {
    const rows = await queryDatabase(
      localDb.url,
      `SELECT tablename, rowsecurity FROM pg_tables
       WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [FIXTURE_TABLES as unknown as string[]],
    );
    for (const row of rows) {
      const {tablename, rowsecurity} = row as {
        tablename: string;
        rowsecurity: boolean;
      };
      expect(
        rowsecurity,
        `Table '${tablename}' should have RLS enabled`,
      ).toBe(true);
    }
  });

  it("verifies triggers on local tables", async () => {
    const triggers = await queryDatabase(
      localDb.url,
      `SELECT event_object_table AS table_name, trigger_name
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY event_object_table, trigger_name`,
    );
    const triggerNames = triggers.map(
      (r) => (r as {trigger_name: string}).trigger_name,
    );
    expect(triggerNames).toContain("update_category_timestamp");
    expect(triggerNames).toContain("update_product_timestamp");
  });

  it("verifies function was created in local DB", async () => {
    const rows = await queryDatabase(
      localDb.url,
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public'
         AND routine_type = 'FUNCTION'
         AND routine_name IN ('update_updated_at', 'get_products_by_category')`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("verifies view was created in local DB", async () => {
    const rows = await queryDatabase(
      localDb.url,
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = 'public' AND table_name = 'products_with_category'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── Step 4: Commit ──────────────────────────────────────────────────

  it("commits the session migration", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "initial_fixture_schema"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("committed");

    // Session should be cleaned up
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
    // Committed migration should exist
    expect(fileExists(project, ".postkit/db/migrations")).toBe(true);
  });

  it("shows no active session after commit", async () => {
    const result = await runCli(["db", "status", "--json"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.sessionActive).toBe(false);
    expect(status.pendingCommittedMigrations).toBeGreaterThanOrEqual(1);
  });

  // ── Step 5: Deploy to remote ────────────────────────────────────────

  it("deploys committed migrations to remote database", async () => {
    const result = await runCli(["db", "deploy", "--force"], {
      cwd: project.rootDir,
      timeout: 120_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("completed");
  });

  it("verifies fixture tables exist in remote DB after deploy", async () => {
    for (const table of FIXTURE_TABLES) {
      const exists = await tableExists(remoteDb.url, table);
      expect(exists, `Table '${table}' should exist in remote DB`).toBe(true);
    }
  });

  it("verifies RLS is enabled on remote tables", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      `SELECT tablename, rowsecurity FROM pg_tables
       WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [FIXTURE_TABLES as unknown as string[]],
    );
    for (const row of rows) {
      const {tablename, rowsecurity} = row as {
        tablename: string;
        rowsecurity: boolean;
      };
      expect(
        rowsecurity,
        `Table '${tablename}' should have RLS enabled in remote`,
      ).toBe(true);
    }
  });

  it("verifies triggers exist in remote DB", async () => {
    const triggers = await queryDatabase(
      remoteDb.url,
      `SELECT trigger_name FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY trigger_name`,
    );
    const triggerNames = triggers.map(
      (r) => (r as {trigger_name: string}).trigger_name,
    );
    expect(triggerNames).toContain("update_category_timestamp");
    expect(triggerNames).toContain("update_product_timestamp");
  });

  it("verifies function exists in remote DB", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' AND routine_name = 'update_updated_at'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("verifies view exists in remote DB", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = 'public' AND table_name = 'products_with_category'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
