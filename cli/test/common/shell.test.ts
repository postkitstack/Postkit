import {describe, it, expect, vi, beforeEach} from "vitest";
import {EventEmitter} from "events";

vi.mock("child_process", () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

import {exec, spawn} from "child_process";
import {runCommand, runSpawnCommand, runPipedCommands, commandExists} from "../../src/common/shell";

// Helper to create a mock spawn process
function createMockSpawn() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.kill = vi.fn();
  return child;
}

describe("shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runCommand()", () => {
    it("returns stdout/stderr on success", async () => {
      const {promisify} = await import("util");
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
        cb(null, {stdout: "hello", stderr: ""});
        return {} as any;
      });
      const result = await runCommand("echo hello");
      expect(result.stdout).toBe("hello");
      expect(result.exitCode).toBe(0);
    });

    it("trims stdout and stderr", async () => {
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
        cb(null, {stdout: " hello\n", stderr: " "});
        return {} as any;
      });
      const result = await runCommand("echo hello");
      expect(result.stdout).toBe("hello");
      expect(result.stderr).toBe("");
    });

    it("returns non-zero exitCode on failure", async () => {
      const error = new Error("failed") as any;
      error.code = 1;
      error.stdout = "";
      error.stderr = "command not found";
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
        cb(error);
        return {} as any;
      });
      const result = await runCommand("bad-command");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("command not found");
    });

    it("passes cwd and env options", async () => {
      let capturedOpts: any;
      vi.mocked(exec).mockImplementation((_cmd: any, opts: any, cb: any) => {
        capturedOpts = opts;
        cb(null, {stdout: "", stderr: ""});
        return {} as any;
      });
      await runCommand("echo", {cwd: "/tmp", env: {FOO: "bar"}});
      expect(capturedOpts.cwd).toBe("/tmp");
      expect(capturedOpts.env.FOO).toBe("bar");
    });

    it("uses 5-minute default timeout", async () => {
      let capturedOpts: any;
      vi.mocked(exec).mockImplementation((_cmd: any, opts: any, cb: any) => {
        capturedOpts = opts;
        cb(null, {stdout: "", stderr: ""});
        return {} as any;
      });
      await runCommand("echo");
      expect(capturedOpts.timeout).toBe(300000);
    });
  });

  describe("runSpawnCommand()", () => {
    it("returns error when no command specified", async () => {
      const result = await runSpawnCommand([]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("No command specified");
    });

    it("collects stdout and resolves on close", async () => {
      const child = createMockSpawn();
      vi.mocked(spawn).mockReturnValue(child);
      const promise = runSpawnCommand(["echo", "hello"]);
      child.stdout.emit("data", Buffer.from("output"));
      child.emit("close", 0);
      const result = await promise;
      expect(result.stdout).toBe("output");
      expect(result.exitCode).toBe(0);
    });

    it("pipes stdin when input provided", async () => {
      const child = createMockSpawn();
      vi.mocked(spawn).mockReturnValue(child);
      const promise = runSpawnCommand(["cat"], {input: "hello"});
      expect(child.stdin.write).toHaveBeenCalledWith("hello");
      child.emit("close", 0);
      await promise;
    });
  });

  describe("runPipedCommands()", () => {
    it("returns error when producer command empty", async () => {
      const result = await runPipedCommands(
        {args: [""]},
        {args: ["psql"]},
      );
      expect(result.exitCode).toBe(1);
    });

    it("pipes producer stdout to consumer stdin", async () => {
      const src = createMockSpawn();
      const dst = createMockSpawn();
      src.stdout.pipe = vi.fn();
      let spawnCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        spawnCount++;
        return spawnCount === 1 ? src : dst;
      });
      const promise = runPipedCommands(
        {args: ["pg_dump"]},
        {args: ["psql"]},
      );
      expect(src.stdout.pipe).toHaveBeenCalledWith(dst.stdin);
      dst.emit("close", 0);
      await promise;
    });
  });

  describe("commandExists()", () => {
    it("returns true when command found", async () => {
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, cb: any) => {
        cb(null, {stdout: "/usr/bin/node", stderr: ""});
        return {} as any;
      });
      const result = await commandExists("node");
      expect(result).toBe(true);
    });
  });
});
