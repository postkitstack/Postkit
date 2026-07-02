import {describe, it, expect} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createEmptyDir, cleanupDir} from "../helpers/test-project";

describe("Smoke tests — stack subcommand help (no Docker)", () => {
  it("stack --help lists all subcommands", async () => {
    const result = await runCli(["stack", "--help"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("up");
    expect(output).toContain("down");
    expect(output).toContain("restart");
    expect(output).toContain("status");
    expect(output).toContain("logs");
  });

  it("stack up --help shows --wait and --keys flags", async () => {
    const result = await runCli(["stack", "up", "--help"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("--no-wait");
    expect(output).toContain("--no-keys");
  });

  it("stack restart --help shows variadic [services...] argument", async () => {
    const result = await runCli(["stack", "restart", "--help"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    // Commander renders variadic arguments as [services...]
    expect(output).toContain("services");
  });
});

describe("Smoke tests — stack in uninitialized directory (no Docker)", () => {
  it("stack up fails with not-initialized error in empty dir", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["stack", "up"], {cwd: tmpDir});
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toMatch(/not initialized|Config file not found/i);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("stack status fails with not-initialized error in empty dir", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["stack", "status"], {cwd: tmpDir});
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toMatch(/not initialized|Config file not found/i);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("stack restart fails with not-initialized error in empty dir", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["stack", "restart"], {cwd: tmpDir});
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toMatch(/not initialized|Config file not found/i);
    } finally {
      await cleanupDir(tmpDir);
    }
  });

  it("stack down fails with not-initialized error in empty dir", async () => {
    const tmpDir = await createEmptyDir();
    try {
      const result = await runCli(["stack", "down"], {cwd: tmpDir});
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toMatch(/not initialized|Config file not found/i);
    } finally {
      await cleanupDir(tmpDir);
    }
  });
});
