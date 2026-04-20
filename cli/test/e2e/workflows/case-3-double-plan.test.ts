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
  writeFunctionFile,
  writeViewFile,
} from "../helpers/schema-builder";

/**
 * Case 3: Initial Empty DB with Double Plan
 *
 * Start with partial schema (core + category only).
 * First plan/apply creates the category table.
 * Then add more schema files (product + RLS + trigger + function + view).
 * Second plan/apply picks up the new additions.
 *
 * Flow: start → plan → apply → change schema → plan → apply → commit → deploy
 */
describe("Case 3: Double plan — start → plan → apply → add schema → plan → apply → commit → deploy", () => {
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

    // Start with only core + category table (partial schema)
    await installFixtureSections(project, ["infra", "core"]);
    await writeTableSchema(
      project,
      "01_category",
      `CREATE TABLE public.category (
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
`,
    );
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

  // ── Step 2: First plan (category only) ──────────────────────────────

  it("first plan generates diff for category table only", async () => {
    const result = await runCli(["db", "plan"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("category");
  });

  // ── Step 3: First apply ─────────────────────────────────────────────

  it("first apply creates category table in local DB", async () => {
    const result = await runCli(["db", "apply", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies only category exists after first apply", async () => {
    expect(await tableExists(localDb.url, "category")).toBe(true);
    expect(await tableExists(localDb.url, "product")).toBe(false);
  });

  // ── Step 4: Add more schema files ───────────────────────────────────

  it("adds product table, RLS, trigger, function, and view schema files", async () => {
    // Add product table schema
    await writeTableSchema(
      project,
      "02_product",
      `CREATE TABLE public.product (
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
`,
    );

    // Add RLS policies for product
    await writeRlsFile(
      project,
      "02_product",
      `-- RLS policies for product table
ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_manager_all ON public.product
    FOR ALL TO manager
    USING (is_deleted = false)
    WITH CHECK (is_deleted = false);
CREATE POLICY product_readonly_select ON public.product
    FOR SELECT TO readonly
    USING (is_deleted = false AND status = 'published');
`,
    );

    // Add trigger for product
    await writeTriggerFile(
      project,
      "02_product",
      `CREATE TRIGGER update_product_timestamp
    BEFORE UPDATE ON public.product FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
`,
    );

    // Add function
    await writeFunctionFile(
      project,
      "01_get_products_by_category",
      `CREATE FUNCTION public.get_products_by_category(cat_id UUID) RETURNS TABLE(
    product_id UUID,
    product_name CHARACTER VARYING,
    product_sku CHARACTER VARYING,
    product_price DOUBLE PRECISION,
    product_status VARCHAR
)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.sku, p.price, p.status
    FROM public.product p
    WHERE p.category_id = cat_id AND p.is_deleted = false
    ORDER BY p.name;
END;
$$;
`,
    );

    // Add view
    await writeViewFile(
      project,
      "01_products_with_category",
      `CREATE VIEW public.products_with_category WITH (security_invoker='on') AS
SELECT
    p.id AS product_id, p.name AS product_name, p.sku, p.price, p.status,
    c.id AS category_id, c.name AS category_name,
    p.created_at, p.updated_at
FROM public.product p
JOIN public.category c ON c.id = p.category_id
WHERE p.is_deleted = false AND c.is_deleted = false;
`,
    );
  });

  // ── Step 5: Second plan (picks up new schema additions) ─────────────

  it("second plan detects the newly added product schema", async () => {
    const result = await runCli(["db", "plan"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("product");
  });

  // ── Step 6: Second apply ────────────────────────────────────────────

  it("second apply creates product table and related objects in local DB", async () => {
    const result = await runCli(["db", "apply", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies both tables now exist in local DB", async () => {
    expect(await tableExists(localDb.url, "category")).toBe(true);
    expect(await tableExists(localDb.url, "product")).toBe(true);
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
    expect(indexNames).toContain("idx_product_status");
    expect(indexNames).toContain("idx_product_is_deleted");
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

  it("verifies function was created", async () => {
    const rows = await queryDatabase(
      localDb.url,
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
         AND routine_name = 'get_products_by_category'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("verifies view was created", async () => {
    const rows = await queryDatabase(
      localDb.url,
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = 'public' AND table_name = 'products_with_category'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── Step 7: Commit ──────────────────────────────────────────────────

  it("commits all migrations", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "add_category_then_product"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("committed");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });

  // ── Step 8: Deploy to remote ────────────────────────────────────────

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

  it("verifies full schema in remote DB (RLS, triggers, functions, views)", async () => {
    // RLS
    const rlsRows = await queryDatabase(
      remoteDb.url,
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND rowsecurity = true AND tablename IN ('category', 'product')`,
    );
    expect(rlsRows.length).toBe(2);

    // Triggers
    const triggers = await queryDatabase(
      remoteDb.url,
      `SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public'`,
    );
    const triggerNames = triggers.map(
      (r) => (r as {trigger_name: string}).trigger_name,
    );
    expect(triggerNames).toContain("update_product_timestamp");

    // Function
    const funcs = await queryDatabase(
      remoteDb.url,
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public' AND routine_name = 'get_products_by_category'`,
    );
    expect(funcs.length).toBeGreaterThan(0);

    // View
    const views = await queryDatabase(
      remoteDb.url,
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = 'public' AND table_name = 'products_with_category'`,
    );
    expect(views.length).toBeGreaterThan(0);
  });
});
