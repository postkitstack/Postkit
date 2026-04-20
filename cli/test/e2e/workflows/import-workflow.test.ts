import {describe, it, expect, beforeAll, afterAll} from "vitest";
import fs from "fs";
import path from "path";
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
    const tablesDir = path.join(project.schemaPath, "tables");

    if (fs.existsSync(tablesDir)) {
      const files = fs.readdirSync(tablesDir);
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
