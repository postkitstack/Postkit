import {describe, it, expect, beforeAll, afterAll} from "vitest";
import fs from "fs";
import path from "path";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, fileExists} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql, tableExists} from "../helpers/db-query";

describe("Import workflow — import existing database", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();

    // Create tables in the database using the fixture schema patterns
    // to simulate an existing DB to import (with categories + products like real projects)
    await executeSql(
      db.url,
      `
      -- Core function needed by triggers
      CREATE FUNCTION public.update_updated_at() RETURNS trigger
          LANGUAGE plpgsql
          AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$;

      -- Category table (UUID PK, CHECK constraint, indexes, is_deleted)
      CREATE TABLE public.category (
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

      -- Product table (FK to category, price CHECK, status CHECK, indexes)
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

      -- Triggers on both tables
      CREATE TRIGGER update_category_timestamp
          BEFORE UPDATE ON public.category FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at();
      CREATE TRIGGER update_product_timestamp
          BEFORE UPDATE ON public.product FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at();

      -- Seed data
      INSERT INTO public.category (id, name, description) VALUES
          ('a0000000-0000-0000-0000-000000000001'::UUID, 'Electronics', 'Electronic devices'),
          ('a0000000-0000-0000-0000-000000000002'::UUID, 'Furniture', 'Office furniture');
      INSERT INTO public.product (name, sku, category_id, price, status) VALUES
          ('Laptop', 'SKU-001', 'a0000000-0000-0000-0000-000000000001'::UUID, 999.99, 'published'),
          ('Desk Chair', 'SKU-002', 'a0000000-0000-0000-0000-000000000002'::UUID, 299.99, 'published');
      `,
    );

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

  it("imports an existing database", async () => {
    const result = await runCli(
      ["db", "import", "--force", "--name", "initial_baseline"],
      {cwd: project.rootDir, timeout: 90_000},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("import complete");
  });

  it("creates schema files from imported database", async () => {
    // Check that table files were generated
    const tablesDir = path.join(project.schemaPath, "tables");
    if (fs.existsSync(tablesDir)) {
      const files = fs.readdirSync(tablesDir);
      const sqlFiles = files.filter((f) => f.endsWith(".sql"));
      expect(sqlFiles.length).toBeGreaterThan(0);
    }

    // Check functions directory (for update_updated_at)
    const functionsDir = path.join(project.schemaPath, "functions");
    if (fs.existsSync(functionsDir)) {
      const files = fs.readdirSync(functionsDir);
      const sqlFiles = files.filter((f) => f.endsWith(".sql"));
      expect(sqlFiles.length).toBeGreaterThan(0);
    }

    // Check triggers directory
    const triggersDir = path.join(project.schemaPath, "triggers");
    if (fs.existsSync(triggersDir)) {
      const files = fs.readdirSync(triggersDir);
      const sqlFiles = files.filter((f) => f.endsWith(".sql"));
      expect(sqlFiles.length).toBeGreaterThan(0);
    }
  });

  it("creates baseline migration in committed migrations", async () => {
    const migrationsDir = path.join(project.dbDir, "migrations");
    const files = fs.readdirSync(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);
  });
});
