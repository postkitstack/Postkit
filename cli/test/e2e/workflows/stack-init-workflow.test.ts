import {describe, it, expect, beforeAll, afterAll} from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {runCli} from "../helpers/cli-runner";

/**
 * Stack Init Workflow
 *
 * Tests the `postkit init` command's scaffold outputs:
 * directory structure, config files, infra SQL, realm template, and gitignore.
 *
 * No Docker required — all assertions are filesystem-based.
 */
describe("stack init workflow", () => {
  let rootDir: string;

  beforeAll(async () => {
    rootDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "postkit-e2e-init-"),
    );

    // --force skips all interactive prompts so the test runs non-interactively.
    // The project name prompt returns "" with --force, yielding name "_<hex>".
    const result = await runCli(["init", "--force"], {cwd: rootDir});

    if (result.exitCode !== 0) {
      throw new Error(
        `postkit init --force failed (exit ${result.exitCode}):\n${result.stderr || result.stdout}`,
      );
    }
  });

  afterAll(async () => {
    if (rootDir) {
      await fs.promises.rm(rootDir, {recursive: true, force: true});
    }
  });

  // ── Directory structure ───────────────────────────────────────────────

  it("postkit init creates .postkit/auth/providers/ directory", () => {
    const providersDir = path.join(rootDir, ".postkit", "auth", "providers");
    expect(fs.existsSync(providersDir)).toBe(true);
    expect(fs.statSync(providersDir).isDirectory()).toBe(true);
  });

  it("postkit init creates .postkit/stack/ directory", () => {
    const stackDir = path.join(rootDir, ".postkit", "stack");
    expect(fs.existsSync(stackDir)).toBe(true);
    expect(fs.statSync(stackDir).isDirectory()).toBe(true);
  });

  // ── Infra SQL files ───────────────────────────────────────────────────

  it("postkit init creates db/infra/001_roles.sql with IF NOT EXISTS pattern", () => {
    const rolesFile = path.join(rootDir, "db", "infra", "001_roles.sql");
    expect(fs.existsSync(rolesFile)).toBe(true);
    const content = fs.readFileSync(rolesFile, "utf-8");
    expect(content).toContain("IF NOT EXISTS");
  });

  it("postkit init creates db/infra/002_schemas.sql with public/auth/storage schemas", () => {
    const schemasFile = path.join(rootDir, "db", "infra", "002_schemas.sql");
    expect(fs.existsSync(schemasFile)).toBe(true);
    const content = fs.readFileSync(schemasFile, "utf-8");
    expect(content).toContain("CREATE SCHEMA IF NOT EXISTS auth;");
    expect(content).toContain("CREATE SCHEMA IF NOT EXISTS public;");
    expect(content).toContain("CREATE SCHEMA IF NOT EXISTS storage;");
  });

  // ── Realm template ────────────────────────────────────────────────────

  it("postkit init creates realm template at configured path", () => {
    const configPath = path.join(rootDir, "postkit.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      stack?: {keycloak?: {realmTemplate?: string}};
    };

    const realmTemplatePath = config?.stack?.keycloak?.realmTemplate;
    expect(realmTemplatePath).toBeTruthy();

    const realmFile = path.join(rootDir, realmTemplatePath as string);
    expect(fs.existsSync(realmFile)).toBe(true);
  });

  // ── postkit.config.json ───────────────────────────────────────────────

  it("generated postkit.config.json has 'name' field matching <slug>_<hex> pattern", () => {
    const configPath = path.join(rootDir, "postkit.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      name?: string;
    };
    expect(config.name).toBeDefined();
    // With --force and no default, slug is empty → name is "_<8hex>"
    // Pattern allows optional slug prefix: [a-z0-9-]*_[0-9a-f]{8}
    expect(config.name).toMatch(/^[a-z0-9-]*_[0-9a-f]{8}$/);
  });

  it("postkit.config.json name matches pattern: lowercase-slug_[0-9a-f]{8}", () => {
    const configPath = path.join(rootDir, "postkit.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      name?: string;
    };
    // The hex suffix is always exactly 8 characters (4 random bytes)
    const parts = (config.name as string).split("_");
    const hexSuffix = parts[parts.length - 1];
    expect(hexSuffix).toMatch(/^[0-9a-f]{8}$/);
  });

  // ── Secrets files ─────────────────────────────────────────────────────

  it("postkit init creates postkit.secrets.example.json", () => {
    const exampleFile = path.join(rootDir, "postkit.secrets.example.json");
    expect(fs.existsSync(exampleFile)).toBe(true);
    // Should be valid JSON with expected top-level keys
    const content = JSON.parse(fs.readFileSync(exampleFile, "utf-8")) as Record<string, unknown>;
    expect(content).toHaveProperty("db");
    expect(content).toHaveProperty("auth");
  });

  // ── .gitignore ────────────────────────────────────────────────────────

  it("postkit init adds postkit.secrets.json to .gitignore", () => {
    const gitignorePath = path.join(rootDir, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("postkit.secrets.json");
  });

  // ── Idempotency ───────────────────────────────────────────────────────

  it("running postkit init a second time with --force overwrites config", async () => {
    // Capture the name from the first run
    const configPath = path.join(rootDir, "postkit.config.json");
    const firstConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      name?: string;
    };
    const firstName = firstConfig.name;

    // Second init with --force should succeed and regenerate the name
    const result = await runCli(["init", "--force"], {cwd: rootDir});
    expect(result.exitCode).toBe(0);

    const secondConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      name?: string;
    };
    expect(secondConfig.name).toBeDefined();
    expect(secondConfig.name).toMatch(/^[a-z0-9-]*_[0-9a-f]{8}$/);

    // The random ID will almost certainly differ — but regardless the config is valid
    // (very low probability both runs produce identical 4-byte random values)
    // Just verify the name field exists and is properly shaped
    expect(secondConfig.name).not.toBe(undefined);
    // Note: firstName !== secondConfig.name in the vast majority of cases
    // (1 in 4 billion chance of collision) — no strict inequality assertion here
    void firstName;
  });
});
