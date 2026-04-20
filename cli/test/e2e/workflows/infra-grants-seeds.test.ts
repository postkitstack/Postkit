import {describe, it, expect, beforeAll, afterAll} from "vitest";
import fs from "fs";
import path from "path";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";
import {startPostgres, stopPostgres, type TestDatabase} from "../helpers/test-database";
import {executeSql, queryDatabase} from "../helpers/db-query";
import {installFixtureSections} from "../helpers/schema-builder";

describe("Infra, grants, and seeds workflow", () => {
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

    // Install infra section (roles) after session start (the clone overwrites local DB)
    await installFixtureSections(project, [
      "infra",
      "core",
      "tables",
      "rls",
      "grants",
      "seed",
      "trigger",
      "function",
      "view",
    ]);

    // Apply the core function and tables directly so infra/grants/seeds have something to work with
    await executeSql(db.url, fs.readFileSync(path.join(project.schemaPath, "core", "01_update_updated_at.sql"), "utf-8"));
    await executeSql(db.url, fs.readFileSync(path.join(project.schemaPath, "tables", "01_category.table.sql"), "utf-8"));
    await executeSql(db.url, fs.readFileSync(path.join(project.schemaPath, "tables", "02_product.table.sql"), "utf-8"));
  });

  afterAll(async () => {
    // Clean up session
    await runCli(["db", "abort", "--force"], {cwd: project.rootDir}).catch(() => {});
    if (project) await cleanupTestProject(project);
    if (db) await stopPostgres(db);
  });

  it("shows infra files", async () => {
    const result = await runCli(["db", "infra"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("api_user");
    expect(result.stdout).toContain("readonly");
    expect(result.stdout).toContain("editor");
    expect(result.stdout).toContain("manager");
  });

  it("applies infra to local database", async () => {
    const result = await runCli(["db", "infra", "--apply"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/applied|Infra/i);

    // Verify roles were created
    const roles = await queryDatabase(
      db.url,
      "SELECT rolname FROM pg_roles WHERE rolname = ANY(ARRAY['api_user', 'readonly', 'editor', 'manager'])",
    );
    const roleNames = roles.map((r) => (r as {rolname: string}).rolname);
    expect(roleNames).toContain("api_user");
    expect(roleNames).toContain("readonly");
    expect(roleNames).toContain("editor");
    expect(roleNames).toContain("manager");
  });

  it("shows grants files", async () => {
    const result = await runCli(["db", "grants"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("category");
    expect(result.stdout).toContain("product");
  });

  it("applies grants to local database", async () => {
    const result = await runCli(["db", "grants", "--apply"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);

    // Verify grants were applied — editor should have SELECT on category
    const grants = await queryDatabase(
      db.url,
      `SELECT grantee, table_name, privilege_type
       FROM information_schema.role_table_grants
       WHERE grantee IN ('readonly', 'editor', 'manager')
         AND table_name IN ('category', 'product')
       ORDER BY grantee, table_name, privilege_type`,
    );
    expect(grants.length).toBeGreaterThan(0);

    // Check manager has ALL on product
    const managerProductGrants = grants.filter(
      (g) => (g as {grantee: string; table_name: string}).grantee === "manager" &&
             (g as {grantee: string; table_name: string}).table_name === "product",
    );
    expect(managerProductGrants.length).toBeGreaterThan(0);
  });

  it("shows seed files", async () => {
    const result = await runCli(["db", "seed"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Electronics");
    expect(result.stdout).toContain("Furniture");
    expect(result.stdout).toContain("Stationery");
  });

  it("applies seeds to local database", async () => {
    const result = await runCli(["db", "seed", "--apply"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("category");
  });

  it("verifies seed data in database", async () => {
    const rows = await queryDatabase(
      db.url,
      "SELECT name FROM public.category WHERE name IN ('Electronics', 'Furniture', 'Stationery') ORDER BY name",
    );
    expect(rows.length).toBe(3);
    const names = rows.map((r) => (r as {name: string}).name);
    expect(names).toEqual(["Electronics", "Furniture", "Stationery"]);
  });

  it("seeds are idempotent — running again does not duplicate", async () => {
    await runCli(["db", "seed", "--apply"], {cwd: project.rootDir});

    const rows = await queryDatabase(
      db.url,
      "SELECT COUNT(*)::int AS count FROM public.category WHERE name IN ('Electronics', 'Furniture', 'Stationery')",
    );
    // Still exactly 3 — no duplicates
    expect(rows[0]?.count).toBe(3);
  });
});
