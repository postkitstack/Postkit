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
import {installFixtureSchema} from "../helpers/schema-builder";
import {
  startSession,
  runPlan,
  runApply,
  runCommit,
  runDeploy,
  getStatus,
  verifyFixtureSchema,
} from "../helpers/workflow";

/**
 * Case 1: Initial Empty DB
 *
 * Both local and remote start completely empty.
 * The fixture schema files define the desired state.
 *
 * Flow: start → plan → apply → commit → deploy (remote)
 */
describe("Case 1: Empty DB — start → plan → apply → commit → deploy", () => {
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

    await installFixtureSchema(project);
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
  });

  it("shows active session in status --json", async () => {
    const status = await getStatus(project);
    expect(status.sessionActive).toBe(true);
  });

  // ── Step 2: Plan ────────────────────────────────────────────────────

  it("generates a plan from empty DB to fixture schema", async () => {
    const output = await runPlan(project);
    expect(output).toContain("category");
    expect(output).toContain("product");
  });

  // ── Step 3: Apply ───────────────────────────────────────────────────

  it("applies the plan to local database", async () => {
    await runApply(project);
  });

  it("verifies full fixture schema in local DB", async () => {
    await verifyFixtureSchema(localDb.url, "local DB");
  });

  // ── Step 4: Commit ──────────────────────────────────────────────────

  it("commits the session migration", async () => {
    await runCommit(project, "initial_fixture_schema");
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

  it("verifies full fixture schema in remote DB after deploy", async () => {
    await verifyFixtureSchema(remoteDb.url, "remote DB");
  });
});
