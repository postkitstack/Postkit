import fs from "fs";
import path from "path";
import {describe, it, expect} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createEmptyDir, cleanupDir, createTestProject, cleanupTestProject} from "../helpers/test-project";

describe("Smoke tests — basic CLI commands (no Docker)", () => {
  it("prints version", async () => {
    const result = await runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it("prints help", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("PostKit");
    expect(result.stdout).toContain("db");
  });

  it("prints db subcommand help", async () => {
    const result = await runCli(["db", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("start");
    expect(result.stdout).toContain("plan");
    expect(result.stdout).toContain("apply");
    expect(result.stdout).toContain("commit");
    expect(result.stdout).toContain("deploy");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("abort");
  });

  it("db status fails without config file", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["db", "status"], {cwd: tmpDir});
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/not initialized|Config file not found/i);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("db status --json fails without config file", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["db", "status", "--json"], {cwd: tmpDir});
      expect(result.exitCode).not.toBe(0);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("init creates project structure", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["init", "--force"], {cwd: tmpDir});
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("initialized");

      // Verify files created
      expect(fs.existsSync(path.join(tmpDir, "postkit.config.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db", "committed.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "auth"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".gitignore"))).toBe(true);

      // Verify config content
      const config = JSON.parse(fs.readFileSync(path.join(tmpDir, "postkit.config.json"), "utf-8"));
      expect(config.db).toBeDefined();
      expect(config.auth).toBeDefined();
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("init --force re-initializes existing project", async () => {
    const project = await createTestProject({localDbUrl: "postgres://localhost:5432/test"});
    try {
      const result = await runCli(["init", "--force"], {cwd: project.rootDir});
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("initialized");
    } finally {
      await cleanupTestProject(project);
    }
  });
});

describe("init command — detailed tests (no Docker)", () => {
  it("creates all expected directories and runtime files", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "--force"], {cwd: tmpDir});

      // DB directory structure
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db", "session"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db", "migrations"))).toBe(true);

      // Auth directory structure
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "auth"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "auth", "raw"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "auth", "realm"))).toBe(true);

      // Runtime files
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db", "committed.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db", "plan.sql"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db", "schema.sql"))).toBe(true);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("generates valid config with correct defaults", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "--force"], {cwd: tmpDir});

      const config = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "postkit.config.json"), "utf-8"),
      );

      // DB section
      expect(config.db.localDbUrl).toBe("");
      expect(config.db.schemaPath).toBe("schema");
      expect(config.db.schema).toBe("public");
      expect(config.db.remotes).toEqual({});

      // Auth section
      expect(config.auth).toBeDefined();
      expect(config.auth.source).toBeDefined();
      expect(config.auth.target).toBeDefined();
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("initializes committed.json with empty migrations array", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "--force"], {cwd: tmpDir});

      const committed = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".postkit", "db", "committed.json"), "utf-8"),
      );
      expect(committed).toEqual({migrations: []});
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("updates .gitignore with PostKit entries", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "--force"], {cwd: tmpDir});

      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".postkit/");
      expect(gitignore).toContain("postkit.config.json");
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("is idempotent — running twice produces same state", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const first = await runCli(["init", "--force"], {cwd: tmpDir});
      expect(first.exitCode).toBe(0);

      const firstConfig = fs.readFileSync(
        path.join(tmpDir, "postkit.config.json"), "utf-8",
      );

      const second = await runCli(["init", "--force"], {cwd: tmpDir});
      expect(second.exitCode).toBe(0);

      const secondConfig = fs.readFileSync(
        path.join(tmpDir, "postkit.config.json"), "utf-8",
      );

      // Config should be identical after second init
      expect(firstConfig).toBe(secondConfig);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("preserves runtime files on re-init", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "--force"], {cwd: tmpDir});

      // Write some data to committed.json
      const committedPath = path.join(tmpDir, ".postkit", "db", "committed.json");
      fs.writeFileSync(committedPath, JSON.stringify({migrations: [{test: true}]}));

      // Re-init should NOT overwrite existing runtime files
      await runCli(["init", "--force"], {cwd: tmpDir});

      const committed = JSON.parse(fs.readFileSync(committedPath, "utf-8"));
      expect(committed.migrations).toHaveLength(1);
      expect(committed.migrations[0].test).toBe(true);
    } finally {
      await cleanupDir(tmpDir);
    }
  });
});
