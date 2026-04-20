import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql, ensureDatabaseExists, queryDatabase} from "../helpers/db-query";
import {writeInfraFile, writeSeedFile, SIMPLE_INFRA_SQL} from "../helpers/schema-builder";

describe("Infra and seeds workflow", () => {
  let db: TestDatabase;
  let project: TestProject;

  beforeAll(async () => {
    db = await startPostgres();

    project = await createTestProject({
      localDbUrl: db.url,
      remoteDbUrl: db.url,
      remoteName: "dev",
    });

    // Start a session so local target commands work
    const startResult = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(startResult.exitCode).toBe(0);

    // Create seed target table AFTER session start (the clone overwrites local DB)
    await executeSql(db.url, `CREATE TABLE IF NOT EXISTS seed_target (id SERIAL PRIMARY KEY, name TEXT);`);
  });

  afterAll(async () => {
    // Clean up session
    await runCli(["db", "abort", "--force"], {cwd: project.rootDir}).catch(() => {});
    if (project) await cleanupTestProject(project);
    if (db) await stopPostgres(db);
  });

  it("shows no infra files initially", async () => {
    const result = await runCli(["db", "infra"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    // Output shows "Infra files should be placed in:" when no files found
    expect(result.stdout).toContain("infra");
  });

  it("shows no seed files initially", async () => {
    const result = await runCli(["db", "seed"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("seed");
  });

  it("creates infra file and shows generated SQL", async () => {
    await writeInfraFile(project, "extensions", SIMPLE_INFRA_SQL);

    const result = await runCli(["db", "infra"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("uuid-ossp");
  });

  it("applies infra to local database", async () => {
    const result = await runCli(["db", "infra", "--apply"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/applied|Infra/i);

    // Verify extension installed
    const rows = await queryDatabase(
      db.url,
      "SELECT COUNT(*)::int AS count FROM pg_extension WHERE extname = 'uuid-ossp'",
    );
    expect(rows[0]?.count).toBeGreaterThanOrEqual(1);
  });

  it("creates seed file and shows generated SQL", async () => {
    const seedSql = `
-- Seed data for testing
INSERT INTO seed_target (name) VALUES ('seeded_value_1'), ('seeded_value_2');
`;
    await writeSeedFile(project, "initial_data", seedSql);

    const result = await runCli(["db", "seed"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("seeded_value");
  });

  it("applies seeds to local database", async () => {
    const result = await runCli(["db", "seed", "--apply"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    // Command shows SQL and attempts to apply (spinner output stripped in non-TTY)
    expect(result.stdout).toContain("seed_target");
  });

  it("verifies seed data in database", async () => {
    const rows = await queryDatabase(db.url, "SELECT * FROM seed_target WHERE name LIKE 'seeded_value%'");
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
