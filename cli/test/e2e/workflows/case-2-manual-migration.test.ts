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
import {installFixtureSchema, FIXTURE_TABLES} from "../helpers/schema-builder";
import {
  startSession,
  runPlan,
  runApply,
  runCommit,
  runDeploy,
  createManualMigration,
  verifyTablesExist,
  verifyRlsEnabled,
  verifyTriggersExist,
} from "../helpers/workflow";

/**
 * Case 2: Initial Empty DB with Manual Migration
 *
 * Both local and remote start empty.
 * Install the FULL fixture schema and plan/apply it first.
 * Then create an additional manual migration on top using the `migration` command.
 *
 * Flow: start → plan → apply → migration <name> → apply → commit → deploy
 */
describe("Case 2: Empty DB with manual migration — start → plan → apply → migration → apply → commit → deploy", () => {
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
  });

  // ── Step 2: Plan (full fixture schema) ──────────────────────────────

  it("generates a plan for the full fixture schema", async () => {
    const output = await runPlan(project);
    expect(output).toContain("category");
    expect(output).toContain("product");
  });

  // ── Step 3: Apply (full fixture schema) ─────────────────────────────

  it("applies the fixture schema to local DB", async () => {
    await runApply(project);
  });

  it("verifies all fixture tables exist with RLS in local DB", async () => {
    await verifyTablesExist(localDb.url, FIXTURE_TABLES, "local DB");
    await verifyRlsEnabled(localDb.url, FIXTURE_TABLES, "local DB");
  });

  // ── Step 4: Create manual migration (additional change on top) ──────

  it("creates a manual migration and injects SQL into template placeholder", async () => {
    await createManualMigration(
      project,
      "add_product_tags",
      `-- Tag table for categorizing products
CREATE TABLE tag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name CHARACTER VARYING(50) NOT NULL,
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tag_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);
CREATE INDEX idx_tag_name ON tag(name);
CREATE INDEX idx_tag_is_deleted ON tag(is_deleted);

-- Many-to-many relationship between products and tags
CREATE TABLE product_tag (
    product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);`,
    );
  });

  // ── Step 5: Apply manual migration ──────────────────────────────────

  it("applies the manual migration to local DB", async () => {
    await runApply(project);
  });

  it("verifies manual migration tables exist in local DB", async () => {
    await verifyTablesExist(localDb.url, ["tag", "product_tag"], "local DB");
  });

  // ── Step 6: Commit ──────────────────────────────────────────────────

  it("commits all migrations", async () => {
    await runCommit(project, "fixture_schema_plus_tags");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });

  // ── Step 7: Deploy to remote ────────────────────────────────────────

  it("deploys to remote database", async () => {
    await runDeploy(project);
  });

  it("verifies fixture tables AND manual migration tables exist in remote DB", async () => {
    await verifyTablesExist(remoteDb.url, [...FIXTURE_TABLES, "tag", "product_tag"], "remote DB");
  });

  it("verifies RLS on fixture tables in remote DB", async () => {
    await verifyRlsEnabled(remoteDb.url, FIXTURE_TABLES, "remote DB");
  });

  it("verifies triggers exist in remote DB", async () => {
    await verifyTriggersExist(
      remoteDb.url,
      ["update_category_timestamp", "update_product_timestamp"],
      "remote DB",
    );
  });
});
