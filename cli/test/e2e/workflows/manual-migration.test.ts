import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, fileExists} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql, tableExists} from "../helpers/db-query";

describe("Manual migration workflow", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();

    // Seed remote so start has something to clone
    await executeSql(db.url, `CREATE TABLE base_table (id SERIAL PRIMARY KEY, val TEXT);`);

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

  it("starts a session", async () => {
    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");
  });

  it("creates a manual migration file", async () => {
    const result = await runCli(
      ["db", "migration", "add_categories", "--force"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manual migration created");

    // Overwrite template with real SQL
    const fs = await import("fs/promises");
    const path = await import("path");
    const sessionDir = path.join(project.dbDir, "session");
    const files = await fs.readdir(sessionDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);

    const migrationPath = path.join(sessionDir, sqlFiles[0]!);
    await fs.writeFile(
      migrationPath,
      `-- migrate:up\nCREATE TABLE categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL);\n\n-- migrate:down\nDROP TABLE IF EXISTS categories;\n`,
      "utf-8",
    );
  });

  it("applies the manual migration", async () => {
    const result = await runCli(["db", "apply", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies table was created in database", async () => {
    const exists = await tableExists(db.url, "categories");
    expect(exists).toBe(true);
  });

  it("commits the manual migration", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "add_categories"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("committed");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });
});
