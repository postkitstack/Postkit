import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";
import {startPostgresPair, stopPostgresPair, type TestDatabase} from "../helpers/test-database";
import {executeSql, tableExists} from "../helpers/db-query";

describe("Deploy workflow — full cycle with two databases", () => {
  let localDb: TestDatabase;
  let remoteDb: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    const {local, remote} = await startPostgresPair();
    localDb = local;
    remoteDb = remote;

    // Seed remote with initial table
    await executeSql(
      remoteDb.url,
      `CREATE TABLE deploy_base (id SERIAL PRIMARY KEY, name TEXT);`,
    );

    project = await createTestProject({
      localDbUrl: localDb.url,
      remoteDbUrl: remoteDb.url,
      remoteName: "dev",
    });
  });

  afterAll(async () => {
    if (project) await cleanupTestProject(project);
    if (localDb || remoteDb) await stopPostgresPair({local: localDb, remote: remoteDb});
  });

  it("starts a session from remote", async () => {
    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migration session started");
  });

  it("creates and applies a manual migration", async () => {
    // Create migration
    const result = await runCli(
      ["db", "migration", "add_deploy_test_table", "--force"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);

    // Overwrite with real SQL
    const fs = await import("fs/promises");
    const path = await import("path");
    const sessionDir = path.join(project.dbDir, "session");
    const files = await fs.readdir(sessionDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);

    const migrationPath = path.join(sessionDir, sqlFiles[0]!);
    await fs.writeFile(
      migrationPath,
      `-- migrate:up\nCREATE TABLE deploy_test (id SERIAL PRIMARY KEY, value TEXT);\n\n-- migrate:down\nDROP TABLE IF EXISTS deploy_test;\n`,
      "utf-8",
    );

    // Apply
    const applyResult = await runCli(["db", "apply", "--force"], {cwd: project.rootDir});
    expect(applyResult.exitCode).toBe(0);
  });

  it("commits the migration", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "add_deploy_test"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("committed");
  });

  it("deploys to remote database", async () => {
    const result = await runCli(["db", "deploy", "--force"], {
      cwd: project.rootDir,
      timeout: 120_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("completed");
  });

  it("verifies table exists in remote database", async () => {
    const exists = await tableExists(remoteDb.url, "deploy_test");
    expect(exists).toBe(true);
  });
});
