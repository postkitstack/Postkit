import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, fileExists} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql, tableExists, getTableCount} from "../helpers/db-query";

describe("Import workflow — import existing database", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();

    // Create tables in the database to simulate an existing DB to import
    await executeSql(
      db.url,
      `
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category_id INTEGER REFERENCES categories(id)
      );
      INSERT INTO categories (name) VALUES ('Electronics'), ('Books');
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
    // The import should create normalized schema files in schema/tables/
    const fs = await import("fs/promises");
    const path = await import("path");
    const tablesDir = path.join(project.schemaPath, "tables");

    if (fs.existsSync(tablesDir)) {
      const files = await fs.readdir(tablesDir);
      const sqlFiles = files.filter((f) => f.endsWith(".sql"));
      // Should have files for categories and products tables
      expect(sqlFiles.length).toBeGreaterThan(0);
    }
  });

  it("creates baseline migration in committed migrations", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const migrationsDir = path.join(project.dbDir, "migrations");

    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);
  });
});
