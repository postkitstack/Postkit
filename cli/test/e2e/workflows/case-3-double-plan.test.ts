import {describe, it, expect, beforeAll, afterAll} from "vitest";
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
  installFixtureSections,
  writeTableSchema,
  writeRlsFile,
  writeTriggerFile,
  writeFunctionFile,
  writeViewFile,
} from "../helpers/schema-builder";
import {
  startSession,
  runPlan,
  runApply,
  runCommit,
  runDeploy,
  verifyTablesExist,
  verifyRlsEnabled,
  verifyTriggersExist,
  verifyFunctionsExist,
  verifyViewsExist,
  verifyIndexesExist,
} from "../helpers/workflow";

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
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (localDb || remoteDb)
      await stopPostgresPair({local: localDb, remote: remoteDb});
  });

  // ── Step 1: Start session ───────────────────────────────────────────

  it("starts a migration session from empty remote", async () => {
    await startSession(project);

    // Install partial schema AFTER start — db start cleans the schema directory
    // Start with only core + category table
    await installFixtureSections(project, ["infra", "core"]);
    await writeTableSchema(
      project,
      "01_category",
      `CREATE TABLE public.category (
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
`,
    );
  });

  // ── Step 2: First plan (category only) ──────────────────────────────

  it("first plan generates diff for category table only", async () => {
    const output = await runPlan(project);
    expect(output).toContain("category");
  });

  // ── Step 3: First apply ─────────────────────────────────────────────

  it("first apply creates category table in local DB", async () => {
    await runApply(project);
  });

  it("verifies only category exists after first apply", async () => {
    await verifyTablesExist(localDb.url, ["category"], "local DB");
    // product should NOT exist yet
    const {queryDatabase} = await import("../helpers/db-query");
    const rows = await queryDatabase(
      localDb.url,
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'product') AS exists`,
    );
    expect(rows[0]?.exists).toBe(false);
  });

  // ── Step 4: Add more schema files ───────────────────────────────────

  it("adds product table, RLS, trigger, function, and view schema files", async () => {
    await writeTableSchema(
      project,
      "02_product",
      `CREATE TABLE public.product (
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
`,
    );

    await writeRlsFile(
      project,
      "02_product",
      `ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_manager_all ON public.product
    FOR ALL TO manager
    USING (is_deleted = false)
    WITH CHECK (is_deleted = false);
CREATE POLICY product_readonly_select ON public.product
    FOR SELECT TO readonly
    USING (is_deleted = false AND status = 'published');
`,
    );

    await writeTriggerFile(
      project,
      "02_product",
      `CREATE TRIGGER update_product_timestamp
    BEFORE UPDATE ON public.product FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
`,
    );

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
    const output = await runPlan(project);
    expect(output).toContain("product");
  });

  // ── Step 6: Second apply ────────────────────────────────────────────

  it("second apply creates product table and related objects", async () => {
    await runApply(project);
  });

  it("verifies both tables now exist in local DB", async () => {
    await verifyTablesExist(localDb.url, ["category", "product"], "local DB");
  });

  it("verifies RLS, indexes, triggers, function, view on product", async () => {
    await verifyRlsEnabled(localDb.url, ["product"], "local DB");
    await verifyIndexesExist(localDb.url, "product", [
      "idx_product_sku",
      "idx_product_category_id",
      "idx_product_status",
      "idx_product_is_deleted",
    ]);
    await verifyTriggersExist(localDb.url, ["update_product_timestamp"], "local DB");
    await verifyFunctionsExist(localDb.url, ["get_products_by_category"], "local DB");
    await verifyViewsExist(localDb.url, ["products_with_category"], "local DB");
  });

  // ── Step 7: Commit ──────────────────────────────────────────────────

  it("commits all migrations", async () => {
    await runCommit(project, "add_category_then_product");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });

  // ── Step 8: Deploy to remote ────────────────────────────────────────

  it("deploys to remote database", async () => {
    await runDeploy(project);
  });

  it("verifies deployed schema in remote DB", async () => {
    await verifyTablesExist(remoteDb.url, ["category", "product"], "remote DB");
    await verifyRlsEnabled(remoteDb.url, ["product"], "remote DB");
    await verifyTriggersExist(remoteDb.url, ["update_product_timestamp"], "remote DB");
    await verifyFunctionsExist(remoteDb.url, ["get_products_by_category"], "remote DB");
    await verifyViewsExist(remoteDb.url, ["products_with_category"], "remote DB");
  });
});
