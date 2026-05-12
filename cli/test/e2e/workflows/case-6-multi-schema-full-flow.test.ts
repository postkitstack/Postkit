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

/**
 * Case 6: Multi-Schema Full Flow
 *
 * Two PostgreSQL schemas: "public" (category, product) and "app" (orders, order_item).
 * Each schema is self-contained — no cross-schema FK references.
 *
 * Flow: start → plan (both schemas) → apply → commit → deploy
 *
 * Config: schemas: ["public", "app"], schemaPath: "db/schema", infraPath: "db/infra"
 */
describe("Case 6: Multi-schema — public + app schemas", () => {
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

  // ── Step 2: Plan ─────────────────────────────────────────────────────

  it("generates a plan that includes public schema tables", async () => {
    const result = await import("../helpers/cli-runner").then(({runCli}) =>
      runCli(["db", "plan"], {cwd: project.rootDir}),
    );
    if (result.exitCode !== 0) {
      console.log("PLAN STDOUT:", result.stdout);
      console.log("PLAN STDERR:", result.stderr);
    }
    expect(result.exitCode, `Plan failed:\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("category");
    expect(result.stdout).toContain("product");
  });

  // ── Step 3: Apply ───────────────────────────────────────────────────

  it("applies the plan to local database", async () => {
    await runApply(project);
  });

  it("verifies public schema tables exist in local DB after apply", async () => {
    await verifyTablesInSchema(localDb.url, "public", ["category", "product"], "local DB");
  });

  it("verifies app schema tables exist in local DB after apply", async () => {
    await verifyTablesInSchema(localDb.url, "app", ["orders", "order_item"], "local DB");
  });

  it("verifies full multi-schema fixture in local DB", async () => {
    await verifyMultiSchemaFixture(localDb.url, "local DB");
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
});
