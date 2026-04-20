import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, fileExists} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql, ensureDatabaseExists, queryDatabase} from "../helpers/db-query";
import {installFixtureSections} from "../helpers/schema-builder";

describe("Abort workflow — start → abort → verify cleanup", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();

    // Seed the remote DB with a table that mirrors fixture schema patterns
    await executeSql(
      db.url,
      `
      CREATE TABLE category (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        is_deleted BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      `,
    );

    project = await createTestProject({
      localDbUrl: db.url,
      remoteDbUrl: db.url,
      remoteName: "dev",
    });

    // Install fixture schema sections for plan testing
    await installFixtureSections(project, ["core", "tables", "rls", "trigger", "function", "view"]);
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (db) await stopPostgres(db);
  });

  it("starts a session", async () => {
    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(true);
  });

  it("aborts the session", async () => {
    const result = await runCli(["db", "abort", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("aborted");
  });

  it("verifies cleanup after abort", async () => {
    // Session file should be removed
    expect(fileExists(project, ".postkit/db/session.json")).toBe(false);
  });

  it("shows no active session after abort", async () => {
    const result = await runCli(["db", "status", "--json"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);

    const status = JSON.parse(result.stdout);
    expect(status.sessionActive).toBe(false);
  });

  it("can start a new session after abort", async () => {
    // Re-create database and re-seed since abort drops the local (=remote) database
    await ensureDatabaseExists(db.url);
    await executeSql(
      db.url,
      `
      CREATE TABLE category (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        is_deleted BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      `,
    );

    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");
    expect(fileExists(project, ".postkit/db/session.json")).toBe(true);

    // Abort this session to clean up
    await runCli(["db", "abort", "--force"], {cwd: project.rootDir});
  });
});
