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
