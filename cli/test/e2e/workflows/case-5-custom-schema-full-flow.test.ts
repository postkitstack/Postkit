import {describe, it, expect, beforeAll, afterAll} from "vitest";
import fs from "fs";
import path from "path";
import {
  createTestProject,
  cleanupTestProject,
  fileExists,
  type TestProject,
} from "../helpers/test-project";
import {
  startPostgresPair,
  stopPostgresPair,
  type TestDatabase,
} from "../helpers/test-database";
import {executeSql, queryDatabase} from "../helpers/db-query";
import {runCli} from "../helpers/cli-runner";
import {
  startSession,
  runPlan,
  runApply,
  runCommit,
  runDeploy,
  getStatus,
} from "../helpers/workflow";

/**
 * Case 5: Custom Schema — Full Flow
 *
 * Tests the complete migration workflow (import → start → plan → apply → commit → deploy)
 * with tables in a CUSTOM schema ("myapp"), not the default "public".
 *
 * Flow:
 *   1. Seed remote DB with objects in custom schema "myapp"
 *   2. Import with `db import --schema myapp`
 *   3. Start a new session (clones remote)
 *   4. Add a new table to schema files
 *   5. Plan → Apply → Commit → Deploy
 *   6. Verify the new table exists in custom schema on remote
 */

const CUSTOM_SCHEMA = "myapp";

// SQL to seed the remote database with objects in custom schema
const SEED_SQL = `
  CREATE SCHEMA IF NOT EXISTS ${CUSTOM_SCHEMA};

  -- Function: update_updated_at
  CREATE FUNCTION ${CUSTOM_SCHEMA}.update_updated_at() RETURNS trigger
      LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
  $$;

  -- Table: category
  CREATE TABLE ${CUSTOM_SCHEMA}.category (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      is_deleted BOOLEAN DEFAULT false NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  -- Table: product
  CREATE TABLE ${CUSTOM_SCHEMA}.product (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      sku VARCHAR(50) NOT NULL,
      category_id UUID NOT NULL REFERENCES ${CUSTOM_SCHEMA}.category(id) ON DELETE RESTRICT,
      price DOUBLE PRECISION NOT NULL CHECK (price >= 0),
      is_deleted BOOLEAN DEFAULT false NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  -- Trigger: category timestamp
  CREATE TRIGGER update_category_timestamp
      BEFORE UPDATE ON ${CUSTOM_SCHEMA}.category FOR EACH ROW
      EXECUTE FUNCTION ${CUSTOM_SCHEMA}.update_updated_at();

  -- Trigger: product timestamp
  CREATE TRIGGER update_product_timestamp
      BEFORE UPDATE ON ${CUSTOM_SCHEMA}.product FOR EACH ROW
      EXECUTE FUNCTION ${CUSTOM_SCHEMA}.update_updated_at();

  -- View: product list with category
  CREATE VIEW ${CUSTOM_SCHEMA}.product_list AS
  SELECT p.id, p.name, p.sku, p.price, c.name AS category_name
  FROM ${CUSTOM_SCHEMA}.product p
  JOIN ${CUSTOM_SCHEMA}.category c ON c.id = p.category_id
  WHERE p.is_deleted = false;

  -- Seed data
  INSERT INTO ${CUSTOM_SCHEMA}.category (id, name) VALUES
      ('a0000000-0000-0000-0000-000000000001'::UUID, 'Electronics'),
      ('a0000000-0000-0000-0000-000000000002'::UUID, 'Furniture');
  INSERT INTO ${CUSTOM_SCHEMA}.product (name, sku, category_id, price) VALUES
      ('Laptop', 'SKU-001', 'a0000000-0000-0000-0000-000000000001'::UUID, 999.99),
      ('Desk Chair', 'SKU-002', 'a0000000-0000-0000-0000-000000000002'::UUID, 299.99);
`;

// ── Schema-aware verification helpers ──────────────────────────────────────

async function verifyTablesInSchema(
  dbUrl: string,
  schema: string,
  tables: string[],
  label = "DB",
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schema],
  );
  const found = rows.map((r) => (r as {table_name: string}).table_name);
  for (const table of tables) {
    expect(found, `Table '${table}' should exist in schema '${schema}' (${label})`).toContain(table);
  }
}

async function verifyFunctionsInSchema(
  dbUrl: string,
  schema: string,
  functionNames: string[],
  label = "DB",
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT routine_name FROM information_schema.routines
     WHERE routine_schema = $1 AND routine_type = 'FUNCTION'
     ORDER BY routine_name`,
    [schema],
  );
  const found = rows.map((r) => (r as {routine_name: string}).routine_name);
  for (const name of functionNames) {
    expect(found, `Function '${name}' should exist in schema '${schema}' (${label})`).toContain(name);
  }
}

async function verifyViewsInSchema(
  dbUrl: string,
  schema: string,
  viewNames: string[],
  label = "DB",
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT table_name FROM information_schema.views
     WHERE table_schema = $1
     ORDER BY table_name`,
    [schema],
  );
  const found = rows.map((r) => (r as {table_name: string}).table_name);
  for (const name of viewNames) {
    expect(found, `View '${name}' should exist in schema '${schema}' (${label})`).toContain(name);
  }
}

async function verifyTriggersInSchema(
  dbUrl: string,
  schema: string,
  triggerNames: string[],
  label = "DB",
): Promise<void> {
  const rows = await queryDatabase(
    dbUrl,
    `SELECT trigger_name FROM information_schema.triggers
     WHERE trigger_schema = $1
     ORDER BY trigger_name`,
    [schema],
  );
  const found = rows.map((r) => (r as {trigger_name: string}).trigger_name);
  for (const name of triggerNames) {
    expect(found, `Trigger '${name}' should exist in schema '${schema}' (${label})`).toContain(name);
  }
}

async function verifySeedsInSchema(
  dbUrl: string,
  schema: string,
): Promise<void> {
  const categories = await queryDatabase(
    dbUrl,
    `SELECT name FROM ${schema}.category ORDER BY name`,
  );
  const names = categories.map((r) => (r as {name: string}).name);
  expect(names).toContain("Electronics");
  expect(names).toContain("Furniture");

  const products = await queryDatabase(
    dbUrl,
    `SELECT name FROM ${schema}.product ORDER BY name`,
  );
  const productNames = products.map((r) => (r as {name: string}).name);
  expect(productNames).toContain("Laptop");
  expect(productNames).toContain("Desk Chair");
}

// ── Test ───────────────────────────────────────────────────────────────────

describe("Case 5: Custom Schema — import → start → plan → apply → commit → deploy", () => {
  let localDb: TestDatabase;
  let remoteDb: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    const {local, remote} = await startPostgresPair();
    localDb = local;
    remoteDb = remote;

    // Seed remote DB with objects in custom schema
    await executeSql(remoteDb.url, SEED_SQL);

    project = await createTestProject({
      localDbUrl: localDb.url,
      remoteDbUrl: remoteDb.url,
      remoteName: "dev",
    });

    // Set custom schema in config
    const config = JSON.parse(fs.readFileSync(project.configPath, "utf-8"));
    config.db.schema = CUSTOM_SCHEMA;
    fs.writeFileSync(project.configPath, JSON.stringify(config, null, 2));
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (localDb || remoteDb)
      await stopPostgresPair({local: localDb, remote: remoteDb});
  });

  // ── Phase 1: Import existing database ─────────────────────────────────

  it("imports the custom schema database", async () => {
    const result = await runCli(
      ["db", "import", "--force", "--name", "custom_schema_baseline", "--url", remoteDb.url, "--schema", CUSTOM_SCHEMA],
      {cwd: project.rootDir, timeout: 90_000},
    );
    if (result.exitCode !== 0) {
      console.log("IMPORT STDOUT:", result.stdout);
      console.log("IMPORT STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("import complete");
  });

  it("creates schema files in PostKit structure", () => {
    const tablesDir = path.join(project.schemaPath, "tables");
    expect(fs.existsSync(tablesDir)).toBe(true);
    const files = fs.readdirSync(tablesDir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("creates baseline migration with SET search_path", () => {
    const migrationsDir = path.join(project.dbDir, "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    const content = fs.readFileSync(path.join(migrationsDir, files[0]!), "utf-8");
    expect(content).toContain(`SET search_path TO "${CUSTOM_SCHEMA}"`);
  });

  it("committed.json tracks the baseline", async () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(project.dbDir, "committed.json"), "utf-8"),
    );
    expect(committed.migrations).toHaveLength(1);
    expect(committed.migrations[0].migrationFile.path).toMatch(/\.postkit\//);
    // Path should be relative (not absolute)
    expect(path.isAbsolute(committed.migrations[0].migrationFile.path)).toBe(false);
  });

  // ── Phase 2: Start a new session ──────────────────────────────────────

  it("starts a migration session from remote", async () => {
    await startSession(project);
    expect(fileExists(project, ".postkit/db/session.json")).toBe(true);
  });

  it("local DB has imported tables in custom schema after clone", async () => {
    await verifyTablesInSchema(localDb.url, CUSTOM_SCHEMA, ["category", "product"], "local after start");
  });

  // ── Phase 3: Add a new table to schema files and plan ─────────────────

  it("adds a new table (tag) to schema files", () => {
    const tablesDir = path.join(project.schemaPath, "tables");
    const tagSql = `
-- Table: tag
CREATE TABLE tag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`;
    fs.writeFileSync(path.join(tablesDir, "03_tag.table.sql"), tagSql.trim() + "\n");
  });

  it("generates a plan that includes the new table", async () => {
    const output = await runPlan(project);
    expect(output).toContain("tag");
  });

  // ── Phase 4: Apply the migration locally ──────────────────────────────

  it("applies the plan to local database", async () => {
    await runApply(project);
  });

  it("verifies all tables exist in local DB custom schema", async () => {
    await verifyTablesInSchema(
      localDb.url, CUSTOM_SCHEMA,
      ["category", "product", "tag"],
      "local after apply",
    );
  });

  it("verifies functions exist in local DB custom schema", async () => {
    await verifyFunctionsInSchema(
      localDb.url, CUSTOM_SCHEMA,
      ["update_updated_at"],
      "local after apply",
    );
  });

  it("verifies views exist in local DB custom schema", async () => {
    await verifyViewsInSchema(
      localDb.url, CUSTOM_SCHEMA,
      ["product_list"],
      "local after apply",
    );
  });

  it("verifies triggers exist in local DB custom schema", async () => {
    await verifyTriggersInSchema(
      localDb.url, CUSTOM_SCHEMA,
      ["update_category_timestamp", "update_product_timestamp"],
      "local after apply",
    );
  });

  it("verifies seed data is intact in local DB", async () => {
    await verifySeedsInSchema(localDb.url, CUSTOM_SCHEMA);
  });

  // ── Phase 5: Commit ───────────────────────────────────────────────────

  it("commits the session migration", async () => {
    await runCommit(project, "add_tag_table");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });

  it("shows pending committed migrations", async () => {
    const status = await getStatus(project);
    expect(status.pendingCommittedMigrations).toBeGreaterThanOrEqual(1);
  });

  it("committed.json has relative paths for migration files", async () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(project.dbDir, "committed.json"), "utf-8"),
    );
    for (const migration of committed.migrations) {
      expect(
        path.isAbsolute(migration.migrationFile.path),
        `Migration path should be relative, got: ${migration.migrationFile.path}`,
      ).toBe(false);
    }
  });

  // ── Phase 6: Deploy to remote ─────────────────────────────────────────

  it("deploys committed migrations to remote database", async () => {
    await runDeploy(project, 120_000);
  });

  it("verifies all tables exist in remote DB custom schema", async () => {
    await verifyTablesInSchema(
      remoteDb.url, CUSTOM_SCHEMA,
      ["category", "product", "tag"],
      "remote after deploy",
    );
  });

  it("verifies functions exist in remote DB custom schema", async () => {
    await verifyFunctionsInSchema(
      remoteDb.url, CUSTOM_SCHEMA,
      ["update_updated_at"],
      "remote after deploy",
    );
  });

  it("verifies views exist in remote DB custom schema", async () => {
    await verifyViewsInSchema(
      remoteDb.url, CUSTOM_SCHEMA,
      ["product_list"],
      "remote after deploy",
    );
  });

  it("verifies triggers exist in remote DB custom schema", async () => {
    await verifyTriggersInSchema(
      remoteDb.url, CUSTOM_SCHEMA,
      ["update_category_timestamp", "update_product_timestamp"],
      "remote after deploy",
    );
  });

  it("verifies seed data is intact in remote DB", async () => {
    await verifySeedsInSchema(remoteDb.url, CUSTOM_SCHEMA);
  });

  // ── Phase 7: Verify schema_migrations is in postkit schema ────────────

  it("schema_migrations is in postkit schema (not public) on remote", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'postkit' AND table_name = 'schema_migrations'",
    );
    expect(rows.length).toBe(1);
  });

  it("baseline and new migration versions are tracked on remote", async () => {
    const rows = await queryDatabase(
      remoteDb.url,
      "SELECT version FROM postkit.schema_migrations ORDER BY version",
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
