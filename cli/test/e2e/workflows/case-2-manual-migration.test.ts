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
import {
  installFixtureSections,
  writeTableSchema,
  writeRlsFile,
  writeTriggerFile,
} from "../helpers/schema-builder";

/**
 * Case 2: Initial Empty DB with Manual Migration
 *
 * Start with empty DBs. Install partial fixture schema (category only).
 * Run the plan/apply cycle, then add a manual migration for the product table.
 *
 * Flow: start → plan → apply → create manual migration → apply → commit → deploy
 */
describe("Case 2: Empty DB with manual migration — start → plan → apply → manual migration → apply → commit → deploy", () => {
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

    // Install only core + category table (not product — that comes via manual migration)
    await installFixtureSections(project, ["infra", "core"]);
    await writeTableSchema(project, "01_category", `CREATE TABLE public.category (
    id UUID PRIMARY KEY DEFAULT public.gen_random_uuid(),
    name CHARACTER VARYING(100) NOT NULL,
    description TEXT,
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT category_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);
CREATE INDEX idx_category_name ON public.category(name);
CREATE INDEX idx_category_is_deleted ON public.category(is_deleted);
`);
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

  // ── Step 2: Plan (category table) ───────────────────────────────────

  it("generates a plan for category table", async () => {
    const result = await runCli(["db", "plan"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("category");
  });

  // ── Step 3: Apply (category table) ──────────────────────────────────

  it("applies the plan — creates category table in local DB", async () => {
    const result = await runCli(["db", "apply", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies category table exists in local DB", async () => {
    const exists = await tableExists(localDb.url, "category");
    expect(exists).toBe(true);
  });

  // ── Step 4: Create manual migration (product table) ─────────────────

  it("creates a manual migration file", async () => {
    const result = await runCli(
      ["db", "migration", "add_product_table", "--force"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manual migration created");

    // Overwrite the template with full product SQL (table + RLS + trigger)
    const fs = await import("fs/promises");
    const path = await import("path");
    const sessionDir = path.join(project.dbDir, "session");
    const files = await fs.readdir(sessionDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);

    // Find the manual migration file (most recently created)
    const migrationPath = path.join(
      sessionDir,
      sqlFiles[sqlFiles.length - 1]!,
    );
    await fs.writeFile(
      migrationPath,
      `-- migrate:up
CREATE TABLE public.product (
    id UUID PRIMARY KEY DEFAULT public.gen_random_uuid(),
    name CHARACTER VARYING(200) NOT NULL,
    sku CHARACTER VARYING(50) NOT NULL,
    category_id UUID NOT NULL REFERENCES public.category(id) ON DELETE RESTRICT,
    price DOUBLE PRECISION NOT NULL CHECK (price >= 0),
    status VARCHAR(15) NOT NULL DEFAULT 'draft'
        CHECK ((status)::text = ANY (ARRAY['draft', 'published', 'archived'])),
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);
CREATE INDEX idx_product_sku ON public.product(sku);
CREATE INDEX idx_product_category_id ON public.product(category_id);
CREATE INDEX idx_product_status ON public.product(status);
CREATE INDEX idx_product_is_deleted ON public.product(is_deleted);

ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_readonly_select ON public.product
    FOR SELECT TO readonly
    USING (is_deleted = false AND status = 'published');
CREATE POLICY product_editor_select ON public.product
    FOR SELECT TO editor
    USING (is_deleted = false);

CREATE TRIGGER update_product_timestamp
    BEFORE UPDATE ON public.product FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- migrate:down
DROP TABLE IF EXISTS public.product;
`,
      "utf-8",
    );
  });

  // ── Step 5: Apply manual migration ──────────────────────────────────

  it("applies the manual migration to local DB", async () => {
    const result = await runCli(["db", "apply", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies product table was created in local DB", async () => {
    const exists = await tableExists(localDb.url, "product");
    expect(exists).toBe(true);
  });

  it("verifies product table has CHECK constraints", async () => {
    const checks = await queryDatabase(
      localDb.url,
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'product' AND constraint_type = 'CHECK'`,
    );
    expect(checks.length).toBeGreaterThan(0);
  });

  it("verifies RLS is enabled on product table", async () => {
    const rows = await queryDatabase(
      localDb.url,
      `SELECT rowsecurity FROM pg_tables
       WHERE schemaname = 'public' AND tablename = 'product'`,
    );
    expect(rows[0]?.rowsecurity).toBe(true);
  });

  it("verifies indexes on product table", async () => {
    const indexes = await queryDatabase(
      localDb.url,
      `SELECT indexname FROM pg_indexes WHERE tablename = 'product' AND schemaname = 'public'`,
    );
    const indexNames = indexes.map(
      (r) => (r as {indexname: string}).indexname,
    );
    expect(indexNames).toContain("idx_product_sku");
    expect(indexNames).toContain("idx_product_category_id");
  });

  it("verifies trigger on product table", async () => {
    const triggers = await queryDatabase(
      localDb.url,
      `SELECT trigger_name FROM information_schema.triggers
       WHERE event_object_table = 'product' AND trigger_schema = 'public'`,
    );
    const names = triggers.map(
      (r) => (r as {trigger_name: string}).trigger_name,
    );
    expect(names).toContain("update_product_timestamp");
  });

  // ── Step 6: Commit ──────────────────────────────────────────────────

  it("commits all migrations", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "add_category_and_product"],
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

  it("verifies both tables exist in remote DB", async () => {
    expect(await tableExists(remoteDb.url, "category")).toBe(true);
    expect(await tableExists(remoteDb.url, "product")).toBe(true);
  });

  it("verifies RLS on product in remote DB", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      `SELECT rowsecurity FROM pg_tables
       WHERE schemaname = 'public' AND tablename = 'product'`,
    );
    expect(rows[0]?.rowsecurity).toBe(true);
  });

  it("verifies trigger on product in remote DB", async () => {
    const triggers = await queryDatabase(
      remoteDb.url,
      `SELECT trigger_name FROM information_schema.triggers
       WHERE event_object_table = 'product' AND trigger_schema = 'public'`,
    );
    const names = triggers.map(
      (r) => (r as {trigger_name: string}).trigger_name,
    );
    expect(names).toContain("update_product_timestamp");
  });
});
