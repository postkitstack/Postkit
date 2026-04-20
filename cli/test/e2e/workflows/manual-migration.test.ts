import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, fileExists} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql, tableExists, queryDatabase} from "../helpers/db-query";
import {installFixtureSections} from "../helpers/schema-builder";

describe("Manual migration workflow", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();

    // Seed remote with fixture-style table so start has something to clone
    await executeSql(
      db.url,
      `
      CREATE FUNCTION public.update_updated_at() RETURNS trigger
          LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
      $$;

      CREATE TABLE public.category (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          is_deleted BOOLEAN DEFAULT false NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TRIGGER update_category_timestamp
          BEFORE UPDATE ON public.category FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at();
      `,
    );

    project = await createTestProject({
      localDbUrl: db.url,
      remoteDbUrl: db.url,
      remoteName: "dev",
    });

    // Install fixture schema for plan/verification
    await installFixtureSections(project, ["core", "tables", "rls", "trigger", "function", "view"]);
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (db) await stopPostgres(db);
  });

  it("starts a session", async () => {
    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");
  });

  it("creates a manual migration file", async () => {
    const result = await runCli(
      ["db", "migration", "add_product_table", "--force"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manual migration created");

    // Overwrite template with real SQL from fixture schema — product table with RLS
    const fsPromises = await import("fs/promises");
    const pathModule = await import("path");
    const sessionDir = pathModule.join(project.dbDir, "session");
    const files = await fsPromises.readdir(sessionDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);

    const migrationPath = pathModule.join(sessionDir, sqlFiles[0]!);
    await fsPromises.writeFile(
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

-- Trigger for updated_at
CREATE TRIGGER update_product_timestamp
    BEFORE UPDATE ON public.product FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- Function to query products by category
CREATE FUNCTION public.get_products_by_category(cat_id UUID) RETURNS TABLE(
    product_id UUID, product_name VARCHAR, product_sku VARCHAR,
    product_price DOUBLE PRECISION, product_status VARCHAR
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY SELECT p.id, p.name, p.sku, p.price, p.status
    FROM public.product p WHERE p.category_id = cat_id AND p.is_deleted = false ORDER BY p.name;
END;
$$;

-- View joining product + category
CREATE VIEW public.products_with_category AS
SELECT p.id AS product_id, p.name AS product_name, p.sku, p.price, p.status,
       c.id AS category_id, c.name AS category_name, p.created_at, p.updated_at
FROM public.product p JOIN public.category c ON c.id = p.category_id
WHERE p.is_deleted = false AND c.is_deleted = false;

-- migrate:down
DROP VIEW IF EXISTS public.products_with_category;
DROP FUNCTION IF EXISTS public.get_products_by_category(UUID);
DROP TABLE IF EXISTS public.product;
`,
      "utf-8",
    );
  });

  it("applies the manual migration", async () => {
    const result = await runCli(["db", "apply", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies product table was created with constraints", async () => {
    const exists = await tableExists(db.url, "product");
    expect(exists).toBe(true);

    // Verify CHECK constraint exists
    const checks = await queryDatabase(
      db.url,
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'product' AND constraint_type = 'CHECK'`,
    );
    const constraintNames = checks.map((r) => (r as {constraint_name: string}).constraint_name);
    expect(constraintNames.length).toBeGreaterThan(0);
  });

  it("verifies RLS is enabled on product table", async () => {
    const rows = await queryDatabase(
      db.url,
      "SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product'",
    );
    expect(rows[0]?.rowsecurity).toBe(true);
  });

  it("verifies indexes were created", async () => {
    const indexes = await queryDatabase(
      db.url,
      `SELECT indexname FROM pg_indexes WHERE tablename = 'product' AND schemaname = 'public'`,
    );
    const indexNames = indexes.map((r) => (r as {indexname: string}).indexname);
    expect(indexNames).toContain("idx_product_sku");
    expect(indexNames).toContain("idx_product_category_id");
    expect(indexNames).toContain("idx_product_status");
    expect(indexNames).toContain("idx_product_is_deleted");
  });

  it("verifies trigger was created", async () => {
    const triggers = await queryDatabase(
      db.url,
      `SELECT trigger_name FROM information_schema.triggers
       WHERE event_object_table = 'product' AND trigger_schema = 'public'`,
    );
    const triggerNames = triggers.map((r) => (r as {trigger_name: string}).trigger_name);
    expect(triggerNames).toContain("update_product_timestamp");
  });

  it("verifies function was created", async () => {
    const rows = await queryDatabase(
      db.url,
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public' AND routine_name = 'get_products_by_category'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("verifies view was created", async () => {
    const rows = await queryDatabase(
      db.url,
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = 'public' AND table_name = 'products_with_category'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("commits the manual migration", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "add_product_table"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("committed");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });
});
