import {describe, it, expect, beforeAll, afterAll} from "vitest";
import fs from "fs";
import path from "path";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, fileExists} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {queryDatabase, executeSql, tableExists, ensureDatabaseExists} from "../helpers/db-query";
import {installFixtureSchema, FIXTURE_TABLES, FIXTURE_SEED_CATEGORY_IDS} from "../helpers/schema-builder";

describe("Happy path workflow — start → plan → apply → commit", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();

    // Seed the remote DB with existing tables so start has something to clone
    // (using a simple table — the fixture schema will be in the project files)
    await executeSql(
      db.url,
      `CREATE TABLE existing_table (id SERIAL PRIMARY KEY, name TEXT NOT NULL);`,
    );

    project = await createTestProject({
      localDbUrl: db.url,
      remoteDbUrl: db.url,
      remoteName: "dev",
    });

    // Install the full fixture schema into the project's schema directory
    await installFixtureSchema(project);
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (db) await stopPostgres(db);
  });

  it("starts a migration session", async () => {
    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");

    // Verify session file created
    expect(fileExists(project, ".postkit/db/session.json")).toBe(true);
  });

  it("shows active session in status --json", async () => {
    const result = await runCli(["db", "status", "--json"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);

    const status = JSON.parse(result.stdout);
    expect(status.sessionActive).toBe(true);
  });

  it("creates a manual migration file", async () => {
    const result = await runCli(["db", "migration", "add_product_table", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manual migration created");

    // Verify migration file exists in session dir
    expect(fileExists(project, ".postkit/db/session")).toBe(true);
  });

  it("applies migration to local database", async () => {
    // Overwrite the migration template with real SQL from the fixture schema
    // This creates the category + product tables as defined in the fixture
    const fsPromises = await import("fs/promises");
    const sessionDir = path.join(project.dbDir, "session");
    const files = await fsPromises.readdir(sessionDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);

    const migrationPath = path.join(sessionDir, sqlFiles[0]!);
    await fsPromises.writeFile(
      migrationPath,
      `-- migrate:up
${fs.readFileSync(path.join(project.schemaPath, "core", "01_update_updated_at.sql"), "utf-8")}
${fs.readFileSync(path.join(project.schemaPath, "tables", "01_category.table.sql"), "utf-8")}
${fs.readFileSync(path.join(project.schemaPath, "tables", "02_product.table.sql"), "utf-8")}
${fs.readFileSync(path.join(project.schemaPath, "rls", "01_category.rls.sql"), "utf-8")}
${fs.readFileSync(path.join(project.schemaPath, "rls", "02_product.rls.sql"), "utf-8")}
${fs.readFileSync(path.join(project.schemaPath, "trigger", "01_category.trigger.sql"), "utf-8")}
${fs.readFileSync(path.join(project.schemaPath, "trigger", "02_product.trigger.sql"), "utf-8")}
${fs.readFileSync(path.join(project.schemaPath, "function", "01_get_products_by_category.function.sql"), "utf-8")}
${fs.readFileSync(path.join(project.schemaPath, "view", "01_products_with_category.view.sql"), "utf-8")}

-- migrate:down
DROP VIEW IF EXISTS public.products_with_category;
DROP FUNCTION IF EXISTS public.get_products_by_category(UUID);
DROP TABLE IF EXISTS public.product;
DROP TABLE IF EXISTS public.category;
DROP FUNCTION IF EXISTS public.update_updated_at();
`,
      "utf-8",
    );

    const result = await runCli(["db", "apply", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies fixture tables were created in database", async () => {
    for (const table of FIXTURE_TABLES) {
      const exists = await tableExists(db.url, table);
      expect(exists, `Table '${table}' should exist`).toBe(true);
    }
  });

  it("verifies RLS is enabled on fixture tables", async () => {
    const rows = await queryDatabase(
      db.url,
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [FIXTURE_TABLES as unknown as string[]],
    );
    for (const row of rows) {
      expect((row as {rowsecurity: boolean}).rowsecurity, `${(row as {tablename: string}).tablename} should have RLS enabled`).toBe(true);
    }
  });

  it("verifies triggers exist on fixture tables", async () => {
    const triggers = await queryDatabase(
      db.url,
      `SELECT event_object_table AS table_name, trigger_name
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY event_object_table, trigger_name`,
    );
    const triggerNames = triggers.map((r) => (r as {trigger_name: string}).trigger_name);
    expect(triggerNames).toContain("update_category_timestamp");
    expect(triggerNames).toContain("update_product_timestamp");
  });

  it("verifies function was created", async () => {
    const rows = await queryDatabase(
      db.url,
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' AND routine_name = 'update_updated_at'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("verifies view was created", async () => {
    const rows = await queryDatabase(
      db.url,
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'products_with_category'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("commits the session migration", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "add_fixture_tables"],
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
    const result = await runCli(["db", "status", "--json"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);

    const status = JSON.parse(result.stdout);
    expect(status.sessionActive).toBe(false);
    expect(status.pendingCommittedMigrations).toBeGreaterThanOrEqual(1);
  });
});
