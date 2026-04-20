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
import {tableExists, queryDatabase} from "../helpers/db-query";
import {installFixtureSchema, FIXTURE_TABLES} from "../helpers/schema-builder";

/**
 * Case 2: Initial Empty DB with Manual Migration
 *
 * Both local and remote start empty.
 * Install the FULL fixture schema and plan/apply it first.
 * Then create an additional manual migration on top using the `migration` command.
 *
 * Flow: start → plan → apply → migration <name> → apply → commit → deploy
 */
describe("Case 2: Empty DB with manual migration — start → plan → apply → migration → apply → commit → deploy", () => {
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

    // Install the FULL fixture schema (category + product + RLS + triggers + functions + views)
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
  });

  // ── Step 2: Plan (full fixture schema) ──────────────────────────────

  it("generates a plan for the full fixture schema", async () => {
    const result = await runCli(["db", "plan"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("category");
    expect(result.stdout).toContain("product");
  });

  // ── Step 3: Apply (full fixture schema) ─────────────────────────────

  it("applies the fixture schema to local DB", async () => {
    const result = await runCli(["db", "apply", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies all fixture tables exist in local DB", async () => {
    for (const table of FIXTURE_TABLES) {
      const exists = await tableExists(localDb.url, table);
      expect(exists, `Table '${table}' should exist in local DB`).toBe(true);
    }
  });

  it("verifies RLS is enabled on fixture tables", async () => {
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

  // ── Step 4: Create manual migration (additional change on top) ──────

  it("creates a manual migration using the migration command", async () => {
    const result = await runCli(
      ["db", "migration", "add_product_tags", "--force"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manual migration created");

    // Inject SQL into the template placeholder created by the migration command.
    // Template has: "-- Add your SQL migration here\n-- Examples:\n..."
    // We replace only that placeholder, keeping SET search_path and -- migrate:down intact.
    const fs = await import("fs/promises");
    const path = await import("path");
    const sessionDir = path.join(project.dbDir, "session");
    const files = await fs.readdir(sessionDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);

    const migrationPath = path.join(sessionDir, sqlFiles[sqlFiles.length - 1]!);
    let content = await fs.readFile(migrationPath, "utf-8");

    // Replace the placeholder comment block with actual SQL
    content = content.replace(
      /-- Add your SQL migration here[\s\S]*?(?=\n-- migrate:down)/,
      `-- Tag table for categorizing products
CREATE TABLE tag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name CHARACTER VARYING(50) NOT NULL,
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tag_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);
CREATE INDEX idx_tag_name ON tag(name);
CREATE INDEX idx_tag_is_deleted ON tag(is_deleted);

-- Many-to-many relationship between products and tags
CREATE TABLE product_tag (
    product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);`,
    );

    await fs.writeFile(migrationPath, content, "utf-8");
  });

  // ── Step 5: Apply manual migration ──────────────────────────────────

  it("applies the manual migration to local DB", async () => {
    const result = await runCli(["db", "apply", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies manual migration tables exist in local DB", async () => {
    expect(await tableExists(localDb.url, "tag")).toBe(true);
    expect(await tableExists(localDb.url, "product_tag")).toBe(true);
  });

  it("verifies tag table has CHECK constraint", async () => {
    const checks = await queryDatabase(
      localDb.url,
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'tag' AND constraint_type = 'CHECK'`,
    );
    expect(checks.length).toBeGreaterThan(0);
  });

  it("verifies product_tag FK references are correct", async () => {
    const fks = await queryDatabase(
      localDb.url,
      `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.table_name = 'product_tag' AND tc.constraint_type = 'FOREIGN KEY'`,
    );
    expect(fks.length).toBe(2);
  });

  // ── Step 6: Commit ──────────────────────────────────────────────────

  it("commits all migrations", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "fixture_schema_plus_tags"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("committed");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });

  // ── Step 7: Deploy to remote ────────────────────────────────────────

  it("deploys to remote database", async () => {
    const result = await runCli(["db", "deploy", "--force"], {
      cwd: project.rootDir,
      timeout: 120_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("completed");
  });

  it("verifies fixture tables exist in remote DB", async () => {
    for (const table of FIXTURE_TABLES) {
      const exists = await tableExists(remoteDb.url, table);
      expect(exists, `Fixture table '${table}' should exist in remote`).toBe(
        true,
      );
    }
  });

  it("verifies manual migration tables exist in remote DB", async () => {
    expect(await tableExists(remoteDb.url, "tag")).toBe(true);
    expect(await tableExists(remoteDb.url, "product_tag")).toBe(true);
  });

  it("verifies RLS on fixture tables in remote DB", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND rowsecurity = true AND tablename = ANY($1)`,
      [FIXTURE_TABLES as unknown as string[]],
    );
    expect(rows.length).toBe(FIXTURE_TABLES.length);
  });

  it("verifies triggers exist in remote DB", async () => {
    const triggers = await queryDatabase(
      remoteDb.url,
      `SELECT trigger_name FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY trigger_name`,
    );
    const names = triggers.map(
      (r) => (r as {trigger_name: string}).trigger_name,
    );
    expect(names).toContain("update_category_timestamp");
    expect(names).toContain("update_product_timestamp");
  });
});
