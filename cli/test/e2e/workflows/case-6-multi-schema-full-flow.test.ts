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
import {installMultiSchemaFixture} from "../helpers/schema-builder";
import {
  startSession,
  runPlan,
  runApply,
  runCommit,
  runDeploy,
  getStatus,
  verifyTablesInSchema,
  verifyMultiSchemaFixture,
} from "../helpers/workflow";
import {queryDatabase} from "../helpers/db-query";

/**
 * Case 6: Multi-Schema Full Flow
 *
 * Two PostgreSQL schemas: "public" (category, product) and "app" (order, order_item).
 * The app schema references public schema objects — cross-schema FK resolution must work.
 *
 * Flow: start → plan (both schemas, intermediate apply) → apply → commit → deploy
 *
 * Config: schemas: ["public", "app"], schemaPath: "db/schema", infraPath: "db/infra"
 */
describe("Case 6: Multi-schema — public + app schemas with cross-schema FKs", () => {
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
      schemas: ["public", "app"],
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
    expect(fileExists(project, ".postkit/db/session.json")).toBe(true);

    // Install multi-schema fixture AFTER start — db start cleans the schema directory
    await installMultiSchemaFixture(project);
  });

  it("shows active session in status --json", async () => {
    const status = await getStatus(project);
    expect(status.sessionActive).toBe(true);
  });

  // ── Step 2: Plan (public schema first, then app schema) ─────────────

  it("generates a plan that includes public schema tables", async () => {
    const output = await runPlan(project);
    expect(output).toContain("category");
    expect(output).toContain("product");
  });

  // ── Step 3: Apply ───────────────────────────────────────────────────

  it("applies the plan to local database", async () => {
    await runApply(project);
  });

  it("verifies public schema tables exist in local DB after apply", async () => {
    await verifyTablesInSchema(localDb.url, "public", ["category", "product"], "local DB");
  });

  it("verifies app schema tables exist in local DB after apply", async () => {
    await verifyTablesInSchema(localDb.url, "app", ["order", "order_item"], "local DB");
  });

  it("verifies full multi-schema fixture in local DB", async () => {
    await verifyMultiSchemaFixture(localDb.url, "local DB");
  });

  it("verifies cross-schema FK app.order_item.product_id -> public.product.id exists", async () => {
    const rows = await queryDatabase(
      localDb.url,
      `SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'app'
        AND tc.table_name = 'order_item'
        AND kcu.column_name = 'product_id'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const fk = rows[0] as {
      foreign_table_schema: string;
      foreign_table_name: string;
      foreign_column_name: string;
    };
    expect(fk.foreign_table_schema).toBe("public");
    expect(fk.foreign_table_name).toBe("product");
    expect(fk.foreign_column_name).toBe("id");
  });

  // ── Step 4: Commit ──────────────────────────────────────────────────

  it("commits all migrations", async () => {
    await runCommit(project, "initial_multi_schema");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
    expect(fileExists(project, ".postkit/db/migrations")).toBe(true);
  });

  it("shows no active session after commit", async () => {
    const status = await getStatus(project);
    expect(status.sessionActive).toBe(false);
    expect(status.pendingCommittedMigrations).toBeGreaterThanOrEqual(1);
  });

  // ── Step 5: Deploy to remote ────────────────────────────────────────

  it("deploys committed migrations to remote database", async () => {
    await runDeploy(project);
  });

  it("verifies full multi-schema fixture in remote DB after deploy", async () => {
    await verifyMultiSchemaFixture(remoteDb.url, "remote DB");
  });

  it("verifies cross-schema FK exists in remote DB after deploy", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      `SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'app'
        AND tc.table_name = 'order_item'
        AND kcu.column_name = 'product_id'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const fk = rows[0] as {foreign_table_schema: string; foreign_table_name: string};
    expect(fk.foreign_table_schema).toBe("public");
    expect(fk.foreign_table_name).toBe("product");
  });
});
