import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";
import {startPostgresPair, stopPostgresPair, type TestDatabase} from "../helpers/test-database";
import {executeSql, tableExists, queryDatabase} from "../helpers/db-query";
import {installFixtureSections} from "../helpers/schema-builder";

describe("Deploy workflow — full cycle with two databases", () => {
  let localDb: TestDatabase;
  let remoteDb: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    const {local, remote} = await startPostgresPair();
    localDb = local;
    remoteDb = remote;

    // Seed remote with fixture-style table structure
    await executeSql(
      remoteDb.url,
      `
      CREATE TABLE category (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        is_deleted BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      `,
    );

    project = await createTestProject({
      localDbUrl: localDb.url,
      remoteDbUrl: remoteDb.url,
      remoteName: "dev",
    });

    // Install fixture schema for the project
    await installFixtureSections(project, ["core", "tables", "rls", "trigger", "function", "view"]);
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (localDb || remoteDb) await stopPostgresPair({local: localDb, remote: remoteDb});
  });

  it("starts a session from remote", async () => {
    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");
  });

  it("creates and applies a manual migration with fixture schema", async () => {
    // Create migration
    const result = await runCli(
      ["db", "migration", "add_product_with_rls", "--force"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);

    // Overwrite with real SQL from fixture schema
    const fs = await import("fs/promises");
    const path = await import("path");
    const sessionDir = path.join(project.dbDir, "session");
    const files = await fs.readdir(sessionDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);

    const migrationPath = path.join(sessionDir, sqlFiles[0]!);
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

-- migrate:down
DROP TABLE IF EXISTS public.product;
`,
      "utf-8",
    );

    // Apply
    const applyResult = await runCli(["db", "apply", "--force"], {cwd: project.rootDir});
    expect(applyResult.exitCode).toBe(0);
  });

  it("commits the migration", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "add_product_with_rls"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("committed");
  });

  it("deploys to remote database", async () => {
    const result = await runCli(["db", "deploy", "--force"], {
      cwd: project.rootDir,
      timeout: 120_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("completed");
  });

  it("verifies product table exists in remote database", async () => {
    const exists = await tableExists(remoteDb.url, "product");
    expect(exists).toBe(true);
  });

  it("verifies RLS is enabled on deployed table", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      "SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product'",
    );
    expect(rows[0]?.rowsecurity).toBe(true);
  });
});
