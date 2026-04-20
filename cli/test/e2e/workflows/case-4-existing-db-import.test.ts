import {describe, it, expect, beforeAll, afterAll} from "vitest";
import fs from "fs";
import path from "path";
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
import {executeSql, queryDatabase} from "../helpers/db-query";
import {
  startSession,
  runPlan,
  runApply,
  runCommit,
  runDeploy,
  verifyViewsExist,
} from "../helpers/workflow";

/**
 * Case 4: Existing Database
 *
 * Remote DB already has tables (simulating a real production database).
 * Import the schema, verify generated files, then make a change and
 * run the full plan → apply → commit → deploy cycle.
 *
 * Flow: import → verify schema files → start → plan → apply → commit → deploy
 */
describe("Case 4: Existing DB — import → verify → plan → apply → commit → deploy", () => {
  let localDb: TestDatabase;
  let remoteDb: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    const {local, remote} = await startPostgresPair();
    localDb = local;
    remoteDb = remote;

    // Simulate an existing production database with fixture-style schema
    await executeSql(
      remoteDb.url,
      `
      CREATE FUNCTION public.update_updated_at() RETURNS trigger
          LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
      $$;

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

      CREATE TRIGGER update_category_timestamp
          BEFORE UPDATE ON public.category FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at();
      CREATE TRIGGER update_product_timestamp
          BEFORE UPDATE ON public.product FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at();

      INSERT INTO public.category (id, name, description) VALUES
          ('a0000000-0000-0000-0000-000000000001'::UUID, 'Electronics', 'Electronic devices'),
          ('a0000000-0000-0000-0000-000000000002'::UUID, 'Furniture', 'Office furniture');
      INSERT INTO public.product (name, sku, category_id, price, status) VALUES
          ('Laptop', 'SKU-001', 'a0000000-0000-0000-0000-000000000001'::UUID, 999.99, 'published'),
          ('Desk Chair', 'SKU-002', 'a0000000-0000-0000-0000-000000000002'::UUID, 299.99, 'published');
      `,
    );

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

  // ── Step 1: Import existing database ────────────────────────────────

  it("imports the existing database schema", async () => {
    const result = await runCli(
      ["db", "import", "--force", "--name", "initial_baseline", "--url", remoteDb.url],
      {cwd: project.rootDir, timeout: 90_000},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("import complete");
  });

  it("creates schema files from import (tables, functions, triggers)", async () => {
    const checkDir = (subdir: string) => {
      const dir = path.join(project.schemaPath, subdir);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
        expect(files.length, `${subdir}/ should have SQL files`).toBeGreaterThan(0);
      }
    };
    checkDir("tables");
    checkDir("functions");
    checkDir("triggers");
  });

  it("creates baseline migration in committed migrations", async () => {
    const migrationsDir = path.join(project.dbDir, "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  // ── Step 2: Start session and add a new schema change ───────────────

  it("starts a session after import", async () => {
    await startSession(project);
  });

  it("adds a new view schema file to trigger a diff", async () => {
    const viewDir = path.join(project.schemaPath, "view");
    fs.mkdirSync(viewDir, {recursive: true});
    fs.writeFileSync(
      path.join(viewDir, "01_products_with_category.view.sql"),
      `CREATE VIEW public.products_with_category AS
SELECT
    p.id AS product_id, p.name AS product_name, p.sku, p.price, p.status,
    c.id AS category_id, c.name AS category_name,
    p.created_at, p.updated_at
FROM public.product p
JOIN public.category c ON c.id = p.category_id
WHERE p.is_deleted = false AND c.is_deleted = false;
`,
      "utf-8",
    );
  });

  // ── Step 3: Plan → Apply ────────────────────────────────────────────

  it("generates a plan for the new view", async () => {
    const output = await runPlan(project);
    expect(output).toContain("products_with_category");
  });

  it("applies the migration to local DB", async () => {
    await runApply(project);
  });

  it("verifies view was created in local DB", async () => {
    await verifyViewsExist(localDb.url, ["products_with_category"], "local DB");
  });

  // ── Step 4: Commit → Deploy ─────────────────────────────────────────

  it("commits the migration", async () => {
    await runCommit(project, "add_products_view");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });

  it("deploys to remote database", async () => {
    await runDeploy(project);
  });

  it("verifies view exists in remote DB after deploy", async () => {
    await verifyViewsExist(remoteDb.url, ["products_with_category"], "remote DB");
  });

  it("verifies seed data is intact in remote DB", async () => {
    const categories = await queryDatabase(
      remoteDb.url,
      "SELECT COUNT(*)::int AS count FROM public.category",
    );
    expect(categories[0]?.count).toBeGreaterThanOrEqual(2);

    const products = await queryDatabase(
      remoteDb.url,
      "SELECT COUNT(*)::int AS count FROM public.product",
    );
    expect(products[0]?.count).toBeGreaterThanOrEqual(2);
  });
});
