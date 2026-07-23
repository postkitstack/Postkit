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
      // plan_*.sql and schema_*.sql are ephemeral — created on demand, not by init

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
      const secrets = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "postkit.secrets.json"), "utf-8"),
      );

      // postkit.config.json — non-sensitive project settings only (no remotes, no localDbUrl)
      expect(config.db.schemaPath).toBe("db/schema");
      expect(config.db.schemas).toEqual(["public"]);
      expect(config.db.localDbUrl).toBeUndefined();
      expect(config.db.remotes).toBeUndefined();

      // postkit.secrets.json — credentials and remotes
      expect(secrets.db.localDbUrl).toBe("");
      expect(secrets.db.remotes).toEqual({});

      // Auth section in secrets
      expect(secrets.auth).toBeDefined();
      expect(secrets.auth.source).toBeDefined();
      expect(secrets.auth.target).toBeDefined();
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("initializes committed.json with only the storage.migrations bootstrap migration", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "--force"], {cwd: tmpDir});

      const committed = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".postkit", "db", "committed.json"), "utf-8"),
      );
      expect(committed.migrations).toHaveLength(1);
      expect(committed.migrations[0].migrationFile.name).toBe(
        "00000000000001_create_storage_migrations_table.sql",
      );
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("updates .gitignore with PostKit entries", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "--force"], {cwd: tmpDir});

      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      // Ephemeral/session-specific paths are gitignored
      expect(gitignore).toContain(".postkit/db/session.json");
      expect(gitignore).toContain(".postkit/db/plan_*.sql");
      expect(gitignore).toContain(".postkit/db/schema_*.sql");
      expect(gitignore).toContain(".postkit/db/session/");
      expect(gitignore).toContain("postkit.secrets.json");
      // Synced Keycloak provider JARs must be gitignored
      expect(gitignore).toContain(".postkit/auth/providers/");
      // Committed files must NOT be gitignored
      expect(gitignore).not.toContain("postkit.config.json");
      expect(gitignore).not.toContain(".postkit/db/migrations");
      expect(gitignore).not.toContain(".postkit/db/committed.json");
      expect(gitignore).not.toContain(".postkit/auth/raw");
      expect(gitignore).not.toContain(".postkit/auth/realm");
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

      // Non-name fields should be identical after second init
      // (name includes a random suffix so it changes each run)
      const cfg1 = JSON.parse(firstConfig) as Record<string, unknown>;
      const cfg2 = JSON.parse(secondConfig) as Record<string, unknown>;
      delete cfg1.name;
      delete cfg2.name;
      expect(cfg1).toEqual(cfg2);
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

describe("init [module] — scoped init", () => {
  it("rejects an unknown module without creating any files", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["init", "bogus", "--force"], {cwd: tmpDir});
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Unknown module/);
      expect(fs.existsSync(path.join(tmpDir, "postkit.config.json"))).toBe(false);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("`init db` on a fresh directory scaffolds only the db module", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["init", "db", "--force"], {cwd: tmpDir});
      expect(result.exitCode).toBe(0);

      expect(fs.existsSync(path.join(tmpDir, "postkit.config.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "postkit.secrets.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db", "committed.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "db", "infra", "001_roles.sql"))).toBe(true);
      // storage.migrations is only bootstrapped by the full `postkit init`, not the scoped db-only init
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db", "migrations", "00000000000001_create_storage_migrations_table.sql"))).toBe(false);
      const committed = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".postkit", "db", "committed.json"), "utf-8"),
      );
      expect(committed.migrations).toHaveLength(0);

      // auth/stack were NOT scaffolded
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "auth"))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "stack"))).toBe(false);

      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".postkit/db/session.json");
      expect(gitignore).not.toContain(".postkit/auth/providers/");
      expect(gitignore).not.toContain(".postkit/stack/");
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("`init auth` after `init db` adds only auth files and keeps the same project name", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "db", "--force"], {cwd: tmpDir});
      const nameBefore = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "postkit.config.json"), "utf-8"),
      ).name;

      const result = await runCli(["init", "auth", "--force"], {cwd: tmpDir});
      expect(result.exitCode).toBe(0);

      expect(fs.existsSync(path.join(tmpDir, ".postkit", "auth", "raw"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "auth", "realm", "postkit.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "stack"))).toBe(false);

      const nameAfter = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "postkit.config.json"), "utf-8"),
      ).name;
      expect(nameAfter).toBe(nameBefore);

      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".postkit/auth/providers/");
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("`init stack` scaffolds only the .postkit/stack/ directory", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["init", "stack", "--force"], {cwd: tmpDir});
      expect(result.exitCode).toBe(0);

      expect(fs.existsSync(path.join(tmpDir, ".postkit", "stack"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "db"))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, ".postkit", "auth"))).toBe(false);

      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".postkit/stack/");
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("`init db` twice is idempotent — no duplicate committed migrations or gitignore lines", async () => {
    const tmpDir = await createEmptyDir();
    try {
      await runCli(["init", "db", "--force"], {cwd: tmpDir});
      await runCli(["init", "db", "--force"], {cwd: tmpDir});

      const committed = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".postkit", "db", "committed.json"), "utf-8"),
      );
      expect(committed.migrations).toHaveLength(0);

      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore.match(/\.postkit\/db\/session\.json/g)).toHaveLength(1);
    } finally {
      await cleanupDir(tmpDir);
    }
  });
});
