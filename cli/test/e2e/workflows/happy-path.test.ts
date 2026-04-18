import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, fileExists, readJson} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {queryDatabase, executeSql, tableExists, getTableCount} from "../helpers/db-query";
import {writeTableSchema, SIMPLE_TABLE_DDL, SECOND_TABLE_DDL} from "../helpers/schema-builder";

describe("Happy path workflow — start → plan → apply → commit", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();

    // Seed the remote DB with an existing table so start has something to clone
    await executeSql(
      db.url,
      `CREATE TABLE existing_table (id SERIAL PRIMARY KEY, name TEXT NOT NULL);`,
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

  it("starts a migration session", async () => {
    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");

    // Verify session file created
    expect(fileExists(project, ".postkit/db/session.json")).toBe(true);
  });

  it("shows active session in status --json", async () => {
    const result = await runCli(["db", "status", "--json"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);

    const status = JSON.parse(result.stdout);
    expect(status.sessionActive).toBe(true);
  });

  it("creates a migration file manually", async () => {
    const result = await runCli(["db", "migration", "add_posts_table", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manual migration created");

    // Verify migration file exists in session dir
    expect(fileExists(project, ".postkit/db/session")).toBe(true);
  });

  it("applies migration to local database", async () => {
    // Write actual SQL into the migration file so dbmate can apply it
    // The migration command creates a template; we need to overwrite with real SQL
    const fs = await import("fs/promises");
    const path = await import("path");
    const sessionDir = path.join(project.dbDir, "session");
    const files = await fs.readdir(sessionDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);

    // Overwrite the template with real SQL
    const migrationPath = path.join(sessionDir, sqlFiles[0]!);
    await fs.writeFile(
      migrationPath,
      `-- migrate:up\nCREATE TABLE posts (id SERIAL PRIMARY KEY, title TEXT NOT NULL);\n\n-- migrate:down\nDROP TABLE IF EXISTS posts;\n`,
      "utf-8",
    );

    const result = await runCli(["db", "apply", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("applied");
  });

  it("verifies table was created in database", async () => {
    const exists = await tableExists(db.url, "posts");
    expect(exists).toBe(true);
  });

  it("commits the session migration", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "add_posts_table"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("committed");

    // Session should be cleaned up
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);

    // Committed migration should exist
    expect(fileExists(project, ".postkit/db/migrations")).toBe(true);
  });

  it("shows no active session after commit", async () => {
    const result = await runCli(["db", "status", "--json"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);

    const status = JSON.parse(result.stdout);
    expect(status.sessionActive).toBe(false);
    expect(status.pendingCommittedMigrations).toBeGreaterThanOrEqual(1);
  });
});
