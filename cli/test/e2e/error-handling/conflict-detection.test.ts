import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql} from "../helpers/db-query";

describe("Error handling — conflict detection", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();
    await executeSql(db.url, `CREATE TABLE conflict_base (id SERIAL PRIMARY KEY);`);

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

  it("start fails when session already active", async () => {
    // Start first session
    const result1 = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result1.exitCode).toBe(0);

    // Try starting again — should fail
    const result2 = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result2.exitCode).not.toBe(0);
    expect(result2.stdout + result2.stderr).toContain("active migration session already exists");

    // Clean up
    await runCli(["db", "abort", "--force"], {cwd: project.rootDir});
  });

  it("commit fails when changes not applied", async () => {
    // Start a session without applying anything
    await runCli(["db", "start", "--force"], {cwd: project.rootDir});

    // Try committing directly — should fail
    const result = await runCli(
      ["db", "commit", "--force", "--message", "should_fail"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("not been applied");

    // Clean up
    await runCli(["db", "abort", "--force"], {cwd: project.rootDir});
  });
});
