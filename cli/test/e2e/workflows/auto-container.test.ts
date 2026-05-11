import {execSync} from "child_process";
import fs from "fs";
import path from "path";
import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql} from "../helpers/db-query";

// Check Docker availability once at module load time so tests are skipped
// cleanly when Docker is not installed or not running.
function isDockerAvailable(): boolean {
  try {
    execSync("docker info", {stdio: "ignore"});
    return true;
  } catch {
    return false;
  }
}

const dockerAvailable = isDockerAvailable();

// Minimal schema to seed the "remote" database with
const SEED_SQL = `
  CREATE TABLE public.item (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL
  );
  INSERT INTO public.item (name) VALUES ('alpha'), ('beta');
`;

/**
 * Auto-container: db import with empty localDbUrl
 *
 * When localDbUrl is empty in postkit.secrets.json, resolveLocalDb() should
 * automatically start a postgres:{version}-alpine Docker container, use it
 * for the import, and clean it up when the command finishes.
 *
 * Network note: import runs pg_dump on the HOST (not inside Docker), so
 * testcontainer remote DBs are accessible without Docker-in-Docker issues.
 */
describe.skipIf(!dockerAvailable)(
  "auto-container — db import with empty localDbUrl",
  () => {
    let remoteDb: TestDatabase;
    let project: TestProject;

    beforeAll(async () => {
      remoteDb = await startPostgres();
      await executeSql(remoteDb.url, SEED_SQL);

      // No localDbUrl — PostKit must auto-start a Docker container
      project = await createTestProject({
        remoteDbUrl: remoteDb.url,
        remoteName: "dev",
        // localDbUrl intentionally omitted
      });
    }, 120_000);

    afterAll(async () => {
      if (project) await cleanupTestProject(project);
      if (remoteDb) await stopPostgres(remoteDb);
    });

    it("import exits 0 and reports completion", async () => {
      const result = await runCli(
        ["db", "import", "--force", "--name", "auto_container_baseline", "--url", remoteDb.url],
        {cwd: project.rootDir, timeout: 180_000},
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("import complete");
    }, 180_000);

    it("committed.json has exactly one baseline migration", () => {
      const committed = JSON.parse(
        fs.readFileSync(path.join(project.dbDir, "committed.json"), "utf-8"),
      );
      expect(committed.migrations).toHaveLength(1);
      expect(committed.migrations[0].description).toContain("Baseline import");
    });

    it("baseline migration SQL file exists and contains CREATE TABLE", () => {
      const migrationsDir = path.join(project.dbDir, "migrations");
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
      expect(files.length).toBeGreaterThan(0);
      const content = fs.readFileSync(path.join(migrationsDir, files[0]!), "utf-8");
      expect(content).toContain("CREATE TABLE");
      expect(content).toContain("item");
    });

    it("schema files were created for the imported table", () => {
      const tablesDir = path.join(project.schemaPath, "tables");
      expect(fs.existsSync(tablesDir)).toBe(true);
      const files = fs.readdirSync(tablesDir).filter((f) => f.endsWith(".sql"));
      expect(files.length).toBeGreaterThan(0);
    });

    it("import cleaned up its temporary Docker container", () => {
      // PostKit names its session containers with a predictable pattern.
      // After import completes, no postkit_local containers should be running.
      const output = execSync(
        'docker ps --filter "name=postkit_local" --format "{{.Names}}"',
        {encoding: "utf-8"},
      ).trim();
      expect(output).toBe("");
    });

    it("ephemeral artifacts are cleaned up (plan.sql, schema.sql)", () => {
      const dbDir = project.dbDir;
      const planSql = path.join(dbDir, "plan.sql");
      const schemaSql = path.join(dbDir, "schema.sql");
      // Either absent or empty — both mean cleaned up
      const planContent = fs.existsSync(planSql)
        ? fs.readFileSync(planSql, "utf-8").trim()
        : "";
      const schemaContent = fs.existsSync(schemaSql)
        ? fs.readFileSync(schemaSql, "utf-8").trim()
        : "";
      expect(planContent).toBe("");
      expect(schemaContent).toBe("");
    });
  },
);

/**
 * Auto-container: db start with empty localDbUrl
 *
 * Network limitation: `db start` clones the remote DB by running pg_dump
 * *inside* the auto-started Docker container. When the remote is a
 * testcontainer (bound to localhost), it is not reachable from inside another
 * Docker container. Therefore we only verify that:
 *   1. PostKit reaches the Docker step (output mentions container)
 *   2. The failure is a clone/network error, NOT a "Docker not found" error
 *
 * Full happy-path coverage for `start` auto-container requires a remote DB
 * accessible inside Docker (e.g. a service in the same Docker network).
 */
describe.skipIf(!dockerAvailable)(
  "auto-container — db start with empty localDbUrl (partial: Docker step reached)",
  () => {
    let remoteDb: TestDatabase;
    let project: TestProject;

    beforeAll(async () => {
      remoteDb = await startPostgres();
      await executeSql(
        remoteDb.url,
        `CREATE TABLE public.item (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL);`,
      );

      project = await createTestProject({
        remoteDbUrl: remoteDb.url,
        remoteName: "dev",
        // localDbUrl intentionally omitted
      });
    }, 120_000);

    afterAll(async () => {
      // Abort any lingering session so cleanup is clean
      await runCli(["db", "abort", "--force"], {cwd: project.rootDir}).catch(() => {});
      if (project) await cleanupTestProject(project);
      if (remoteDb) await stopPostgres(remoteDb);
    });

    it("start reaches the Docker/container step (not a Docker-unavailable error)", async () => {
      const result = await runCli(["db", "start", "--force"], {
        cwd: project.rootDir,
        timeout: 120_000,
      });

      // Should NOT fail with "Docker not found" — PostKit found Docker fine
      expect(result.stdout + result.stderr).not.toContain("Docker not found");
      expect(result.stdout + result.stderr).not.toContain("Docker is not running");

      // Either fully succeeded (unlikely with localhost remote inside Docker)
      // or failed at the clone step (expected with testcontainer network isolation)
      if (result.exitCode === 0) {
        expect(result.stdout).toContain("Migration session started");
      } else {
        // Acceptable failure: clone failed due to network, not Docker setup
        expect(result.stdout + result.stderr).toMatch(/clone|pg_dump|connect/i);
      }
    }, 120_000);
  },
);
