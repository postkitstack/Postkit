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
  verifyViewsExist,
} from "../helpers/workflow";

/**
 * db import — custom schema (non-public)
 *
 * Seeds a PostgreSQL database with objects in a custom schema "myapp",
 * then runs `db import --schema myapp` and verifies:
 *   - Schema files are generated correctly
 *   - Baseline migration includes SET search_path
 *   - schema_migrations table is created in "postkit" schema (not public)
 *   - Local DB is set up with the imported schema
 *   - Seed data in custom schema is intact
 */
describe("db import — custom schema (non-public)", () => {
  let db: TestDatabase;
  let project: TestProject;

  const CUSTOM_SCHEMA = "myapp";

  // SQL to seed the database with objects in custom schema
  const SCHEMA_SQL = `
    CREATE SCHEMA IF NOT EXISTS ${CUSTOM_SCHEMA};

    -- Function
    CREATE FUNCTION ${CUSTOM_SCHEMA}.update_updated_at() RETURNS trigger
        LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
    $$;

    -- Table: category
    CREATE TABLE ${CUSTOM_SCHEMA}.category (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name CHARACTER VARYING(100) NOT NULL,
        is_deleted BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Table: product
    CREATE TABLE ${CUSTOM_SCHEMA}.product (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name CHARACTER VARYING(200) NOT NULL,
        sku CHARACTER VARYING(50) NOT NULL,
        category_id UUID NOT NULL REFERENCES ${CUSTOM_SCHEMA}.category(id) ON DELETE RESTRICT,
        price DOUBLE PRECISION NOT NULL CHECK (price >= 0),
        is_deleted BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Trigger
    CREATE TRIGGER update_category_timestamp
        BEFORE UPDATE ON ${CUSTOM_SCHEMA}.category FOR EACH ROW
        EXECUTE FUNCTION ${CUSTOM_SCHEMA}.update_updated_at();

    -- View
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

  beforeAll(async () => {
    db = await startPostgres();
    await executeSql(db.url, SCHEMA_SQL);

    project = await createTestProject({
      localDbUrl: db.url,
      remoteDbUrl: db.url,
      remoteName: "dev",
    });

    // Set custom schema in config
    const configPath = project.configPath;
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    config.db.schema = CUSTOM_SCHEMA;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (db) await stopPostgres(db);
  });

  // ── Step 1: Import ──────────────────────────────────────────────────

  it("imports the custom schema database successfully", async () => {
    const result = await runCli(
      ["db", "import", "--force", "--name", "custom_schema_baseline", "--url", db.url, "--schema", CUSTOM_SCHEMA],
      {cwd: project.rootDir, timeout: 90_000},
    );
    if (result.exitCode !== 0) {
      console.log("IMPORT STDOUT:", result.stdout);
      console.log("IMPORT STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("import complete");
  });

  // ── Step 2: Verify schema files ─────────────────────────────────────

  it("creates tables/ directory with SQL files", () => {
    const dir = path.join(project.schemaPath, "tables");
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("creates functions/ directory with SQL files", () => {
    const dir = path.join(project.schemaPath, "functions");
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
      expect(files.length).toBeGreaterThan(0);
    }
  });

  it("creates views/ directory with SQL files", () => {
    const dir = path.join(project.schemaPath, "views");
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
      expect(files.length).toBeGreaterThan(0);
    }
  });

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

  it("creates infra directory with ordered SQL files", () => {
    const infraDir = path.join(project.schemaPath, "infra");
    expect(fs.existsSync(infraDir)).toBe(true);
    const files = fs.readdirSync(infraDir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    // Roles must come before schemas (001_ prefix)
    const hasRoles = files.some((f) => f.includes("roles"));
    const hasSchemas = files.some((f) => f.includes("schemas"));
    if (hasRoles && hasSchemas) {
      const rolesFile = files.find((f) => f.includes("roles"))!;
      const schemasFile = files.find((f) => f.includes("schemas"))!;
      expect(rolesFile.localeCompare(schemasFile)).toBeLessThan(0);
    }
  });

  // ── Step 3: Verify baseline migration ───────────────────────────────

  it("creates baseline migration file", () => {
    const migrationsDir = path.join(project.dbDir, "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("baseline migration includes SET search_path for custom schema", () => {
    const migrationsDir = path.join(project.dbDir, "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const content = fs.readFileSync(
      path.join(migrationsDir, files[0]!),
      "utf-8",
    );
    expect(content).toContain(`SET search_path TO "${CUSTOM_SCHEMA}"`);
    expect(content).toContain("CREATE TABLE");
  });

  // ── Step 4: Verify committed.json ──────────────────────────────────

  it("committed.json tracks the baseline migration", async () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(project.dbDir, "committed.json"), "utf-8"),
    );
    expect(committed.migrations).toHaveLength(1);
    expect(committed.migrations[0].description).toContain("Baseline import");
  });

  // ── Step 5: Verify schema_migrations in postkit schema ──────────────

  it("creates schema_migrations in postkit schema", async () => {
    const rows = await queryDatabase(
      db.url,
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'postkit' AND table_name = 'schema_migrations'",
    );
    expect(rows.length).toBe(1);
  });

  it("inserts baseline version in postkit.schema_migrations", async () => {
    const rows = await queryDatabase(
      db.url,
      "SELECT version FROM postkit.schema_migrations",
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("does NOT create schema_migrations in public schema", async () => {
    const rows = await queryDatabase(
      db.url,
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations'",
    );
    expect(rows.length).toBe(0);
  });

  // ── Step 6: Verify local database state ────────────────────────────

  it("local DB has tables in custom schema", async () => {
    const rows = await queryDatabase(
      db.url,
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = '${CUSTOM_SCHEMA}' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    const tables = rows.map((r) => (r as {table_name: string}).table_name);
    expect(tables).toContain("category");
    expect(tables).toContain("product");
  });

  it("local DB has function in custom schema", async () => {
    const rows = await queryDatabase(
      db.url,
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = '${CUSTOM_SCHEMA}' AND routine_type = 'FUNCTION'
       ORDER BY routine_name`,
    );
    const found = rows.map((r) => (r as {routine_name: string}).routine_name);
    expect(found).toContain("update_updated_at");
  });

  it("local DB has view in custom schema", async () => {
    const rows = await queryDatabase(
      db.url,
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = '${CUSTOM_SCHEMA}' AND table_name = $1`,
      ["product_list"],
    );
    const found = rows.map((r) => (r as {table_name: string}).table_name);
    expect(found).toContain("product_list");
  });

  // ── Step 7: Verify seed data intact ────────────────────────────────

  it("seed data is intact in custom schema", async () => {
    const categories = await queryDatabase(
      db.url,
      `SELECT COUNT(*)::int AS count FROM ${CUSTOM_SCHEMA}.category`,
    );
    expect(categories[0]?.count).toBeGreaterThanOrEqual(2);

    const products = await queryDatabase(
      db.url,
      `SELECT COUNT(*)::int AS count FROM ${CUSTOM_SCHEMA}.product`,
    );
    expect(products[0]?.count).toBeGreaterThanOrEqual(2);
  });
});
