import {describe, it, expect, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createEmptyDir, cleanupDir, createTestProject, cleanupTestProject} from "../helpers/test-project";

describe("Error handling — invalid config", () => {
  it("fails when config file is missing", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["db", "status"], {cwd: tmpDir});
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/not initialized|Config file not found/i);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("fails when no remotes configured", async () => {
    const project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
      // No remoteDbUrl → empty remotes
    });
    try {
      const result = await runCli(["db", "start"], {cwd: project.rootDir});
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/remote|No remotes/i);
    } finally {
      await cleanupTestProject(project);
    }
  });

  it("fails when localDbUrl is invalid", async () => {
    const project = await createTestProject({
      localDbUrl: "postgres://invalid-host:9999/nonexistent",
      remoteDbUrl: "postgres://invalid-host:9999/nonexistent",
    });
    try {
      const result = await runCli(["db", "start"], {cwd: project.rootDir});
      expect(result.exitCode).not.toBe(0);
    } finally {
      await cleanupTestProject(project);
    }
  });
});
