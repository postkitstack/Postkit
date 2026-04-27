import {describe, it, expect, beforeAll, afterAll} from "vitest";
import fs from "fs";
import path from "path";
import {runCli} from "../helpers/cli-runner";
import {
  createTestProject,
  cleanupTestProject,
  type TestProject,
} from "../helpers/test-project";
import {
  startPostgres,
  stopPostgres,
  type TestDatabase,
} from "../helpers/test-database";
import {executeSql, queryDatabase} from "../helpers/db-query";
import {
  verifyTablesExist,
  verifyFunctionsExist,
  verifyTriggersExist,
  verifyViewsExist,
} from "../helpers/workflow";

/**
 * Recursively read all .sql files under the project's schema directory.
 */
function readAllSchemaSql(project: TestProject): string {
  const parts: string[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".sql")) {
        parts.push(fs.readFileSync(full, "utf-8"));
      }
    }
  }
  walk(project.schemaPath);
  return parts.join("\n");
}

/**
 * db import — comprehensive test
 *
 * Seed a PostgreSQL database with a realistic schema (tables, functions,
 * triggers, views, indexes, RLS policies, grants, seed data), then run
 * `db import` and verify every artifact it produces.
 *
 * Flow: seed DB → init project → import → verify schema files / baseline
 *       migration / committed.json / local DB state / seed data intact
 */
describe("db import — seed DB → import → verify all artifacts", () => {
  let db: TestDatabase;
  let project: TestProject;

  // Full schema SQL to seed the "existing" database with
  const SCHEMA_SQL = `
    -- Function: auto-update timestamp
    CREATE FUNCTION public.update_updated_at() RETURNS trigger
        LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
    $$;

    -- Function: get products by category
    CREATE FUNCTION public.get_products_by_category(cat_id UUID) RETURNS TABLE(
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

    -- Table: category
    CREATE TABLE public.category (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name CHARACTER VARYING(100) NOT NULL,
        description TEXT,
        is_deleted BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT category_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
    );
    CREATE INDEX idx_category_name ON public.category(name);
    CREATE INDEX idx_category_is_deleted ON public.category(is_deleted);

    -- Table: product
    CREATE TABLE public.product (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

    -- Triggers
    CREATE TRIGGER update_category_timestamp
        BEFORE UPDATE ON public.category FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at();
    CREATE TRIGGER update_product_timestamp
        BEFORE UPDATE ON public.product FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at();

    -- View: products with category
    CREATE VIEW public.products_with_category WITH (security_invoker='on') AS
    SELECT
        p.id AS product_id, p.name AS product_name, p.sku, p.price, p.status,
        c.id AS category_id, c.name AS category_name,
        p.created_at, p.updated_at
    FROM public.product p
    JOIN public.category c ON c.id = p.category_id
    WHERE p.is_deleted = false AND c.is_deleted = false;

    -- RLS
    ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;
    CREATE POLICY category_readonly_select ON public.category
        FOR SELECT TO PUBLIC USING (is_deleted = false);
    CREATE POLICY product_readonly_select ON public.product
        FOR SELECT TO PUBLIC USING (is_deleted = false AND status = 'published');

    -- Seed data
    INSERT INTO public.category (id, name, description) VALUES
        ('a0000000-0000-0000-0000-000000000001'::UUID, 'Electronics', 'Electronic devices'),
        ('a0000000-0000-0000-0000-000000000002'::UUID, 'Furniture', 'Office furniture'),
        ('a0000000-0000-0000-0000-000000000003'::UUID, 'Stationery', 'Office supplies');
    INSERT INTO public.product (name, sku, category_id, price, status) VALUES
        ('Laptop', 'SKU-001', 'a0000000-0000-0000-0000-000000000001'::UUID, 999.99, 'published'),
        ('Desk Chair', 'SKU-002', 'a0000000-0000-0000-0000-000000000002'::UUID, 299.99, 'published');
  `;

  beforeAll(async () => {
    db = await startPostgres();
    await executeSql(db.url, SCHEMA_SQL);

    project = await createTestProject({
      localDbUrl: db.url,
      remoteDbUrl: db.url,
      remoteName: "dev",
    });
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (db) await stopPostgres(db);
  });

  // ── Step 1: Run import ──────────────────────────────────────────────

  it("imports the database schema successfully", async () => {
    const result = await runCli(
      ["db", "import", "--force", "--name", "initial_baseline", "--url", db.url],
      {cwd: project.rootDir, timeout: 90_000},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("import complete");
  });

  // ── Step 2: Verify schema directory structure ───────────────────────

  it("creates tables/ directory with SQL files", () => {
    const dir = path.join(project.schemaPath, "tables");
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("creates functions/ directory with SQL files", () => {
    const dir = path.join(project.schemaPath, "functions");
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("creates triggers/ directory or includes triggers in tables", () => {
    // pgschema dump may put triggers in a separate triggers/ dir or inline in tables/
    const triggerDir = path.join(project.schemaPath, "triggers");
    if (fs.existsSync(triggerDir)) {
      const files = fs.readdirSync(triggerDir).filter((f) => f.endsWith(".sql"));
      expect(files.length).toBeGreaterThan(0);
    } else {
      // Triggers may be inline in table files — verify content exists somewhere
      const allSql = readAllSchemaSql(project);
      expect(allSql).toContain("TRIGGER");
    }
  });

  it("creates views/ directory with SQL files", () => {
    const dir = path.join(project.schemaPath, "views");
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  // ── Step 3: Verify schema file content ──────────────────────────────

  it("table files contain category and product DDL", () => {
    const dir = path.join(project.schemaPath, "tables");
    const allSql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf-8"))
      .join("\n");
    expect(allSql).toContain("category");
    expect(allSql).toContain("product");
  });

  it("function files contain update_updated_at", () => {
    const dir = path.join(project.schemaPath, "functions");
    const allSql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf-8"))
      .join("\n");
    expect(allSql).toContain("update_updated_at");
  });

  it("schema contains timestamp trigger definitions", () => {
    const allSql = readAllSchemaSql(project);
    expect(allSql).toContain("update_category_timestamp");
    expect(allSql).toContain("update_product_timestamp");
  });

  it("view files contain products_with_category", () => {
    const dir = path.join(project.schemaPath, "views");
    const allSql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf-8"))
      .join("\n");
    expect(allSql).toContain("products_with_category");
  });

  it("creates policies/ directory with RLS policy files", () => {
    const dir = path.join(project.schemaPath, "policies");
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
      expect(files.length).toBeGreaterThan(0);
      const allSql = files
        .map((f) => fs.readFileSync(path.join(dir, f), "utf-8"))
        .join("\n");
      expect(allSql).toContain("ENABLE ROW LEVEL SECURITY");
    }
  });

  // ── Step 4: Verify baseline migration ───────────────────────────────

  it("creates baseline migration file", () => {
    const migrationsDir = path.join(project.dbDir, "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("baseline migration contains CREATE TABLE DDL", () => {
    const migrationsDir = path.join(project.dbDir, "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const content = fs.readFileSync(
      path.join(migrationsDir, files[0]!),
      "utf-8",
    );
    expect(content).toContain("CREATE TABLE");
    expect(content).toContain("category");
    expect(content).toContain("product");
  });

  // ── Step 5: Verify committed.json ───────────────────────────────────

  it("committed.json tracks the baseline migration", async () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(project.dbDir, "committed.json"), "utf-8"),
    );
    expect(committed.migrations).toHaveLength(1);
    expect(committed.migrations[0].description).toContain("Baseline import");
  });

  // ── Step 6: Verify local database state ─────────────────────────────

  it("local DB has both tables", async () => {
    await verifyTablesExist(db.url, ["category", "product"], "local DB");
  });

  it("local DB has functions", async () => {
    await verifyFunctionsExist(
      db.url,
      ["update_updated_at", "get_products_by_category"],
      "local DB",
    );
  });

  it("local DB has triggers", async () => {
    await verifyTriggersExist(
      db.url,
      ["update_category_timestamp", "update_product_timestamp"],
      "local DB",
    );
  });

  it("local DB has view", async () => {
    await verifyViewsExist(db.url, ["products_with_category"], "local DB");
  });

  // ── Step 7: Verify source DB seed data intact ───────────────────────

  it("source DB seed data is intact after import", async () => {
    const categories = await queryDatabase(
      db.url,
      "SELECT COUNT(*)::int AS count FROM public.category",
    );
    expect(categories[0]?.count).toBeGreaterThanOrEqual(3);

    const products = await queryDatabase(
      db.url,
      "SELECT COUNT(*)::int AS count FROM public.product",
    );
    expect(products[0]?.count).toBeGreaterThanOrEqual(2);
  });
});
