import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/common/shell", () => ({
  runCommand: vi.fn(),
  runSpawnCommand: vi.fn(),
  commandExists: vi.fn(),
  runPipedCommands: vi.fn(),
}));

vi.mock("../../../../src/modules/db/services/database", () => ({
  testConnection: vi.fn(),
  getRemotePgMajorVersion: vi.fn().mockResolvedValue(16),
  parseConnectionUrl: vi.fn((url: string) => {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432", 10),
      database: parsed.pathname.slice(1),
      user: parsed.username,
      password: decodeURIComponent(parsed.password),
    };
  }),
}));

vi.mock("../../../../src/common/errors", () => ({
  PostkitError: class PostkitError extends Error {
    hint?: string;
    constructor(message: string, hint?: string) {
      super(message);
      this.hint = hint;
    }
  },
}));

// Mock net to control port-free checks
vi.mock("net", () => {
  const listeners: Record<string, (...args: any[]) => void> = {};
  const mockServer = {
    once: vi.fn((event: string, cb: (...args: any[]) => void) => {
      listeners[event] = cb;
      return mockServer;
    }),
    listen: vi.fn(() => {
      // Default: port is free — trigger "listening" event
      listeners["listening"]?.();
      return mockServer;
    }),
    close: vi.fn((cb?: () => void) => { cb?.(); }),
  };
  return {
    default: {createServer: vi.fn(() => mockServer)},
    createServer: vi.fn(() => mockServer),
  };
});

import {runCommand, runSpawnCommand, commandExists, runPipedCommands} from "../../../../src/common/shell";
import {testConnection, getRemotePgMajorVersion} from "../../../../src/modules/db/services/database";
import {
  checkDockerAvailable,
  startSessionContainer,
  stopSessionContainer,
  cloneDatabaseViaContainer,
  resolveLocalDb,
} from "../../../../src/modules/db/services/container";

describe("container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── checkDockerAvailable ──────────────────────────────────────────────────

  describe("checkDockerAvailable()", () => {
    it("passes when docker is installed and running", async () => {
      vi.mocked(commandExists).mockResolvedValue(true);
      vi.mocked(runCommand).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});
      await expect(checkDockerAvailable()).resolves.toBeUndefined();
    });

    it("throws PostkitError when docker binary is not found", async () => {
      vi.mocked(commandExists).mockResolvedValue(false);
      await expect(checkDockerAvailable()).rejects.toThrow("Docker not found");
    });

    it("throws PostkitError when docker daemon is not running", async () => {
      vi.mocked(commandExists).mockResolvedValue(true);
      vi.mocked(runCommand).mockResolvedValue({stdout: "", stderr: "Cannot connect", exitCode: 1});
      await expect(checkDockerAvailable()).rejects.toThrow("Docker is not running");
    });
  });

  // ─── startSessionContainer ────────────────────────────────────────────────

  describe("startSessionContainer()", () => {
    it("starts a container with the correct versioned image", async () => {
      vi.mocked(runSpawnCommand).mockResolvedValue({
        stdout: "abc123containerid\n",
        stderr: "",
        exitCode: 0,
      });
      vi.mocked(testConnection).mockResolvedValue(true);

      const info = await startSessionContainer(16);

      const spawnArgs = vi.mocked(runSpawnCommand).mock.calls[0]![0];
      expect(spawnArgs).toContain("postgres:16-alpine");
      expect(spawnArgs).toContain("docker");
      expect(spawnArgs).toContain("run");
    });

    it("uses the provided pg version in the image tag", async () => {
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "cid\n", stderr: "", exitCode: 0});
      vi.mocked(testConnection).mockResolvedValue(true);

      await startSessionContainer(14);
      const spawnArgs = vi.mocked(runSpawnCommand).mock.calls[0]![0];
      expect(spawnArgs).toContain("postgres:14-alpine");
    });

    it("returns containerID, localDbUrl, port and pgVersion", async () => {
      vi.mocked(runSpawnCommand).mockResolvedValue({
        stdout: "mycontainerid\n",
        stderr: "",
        exitCode: 0,
      });
      vi.mocked(testConnection).mockResolvedValue(true);

      const info = await startSessionContainer(15);

      expect(info.containerID).toBe("mycontainerid");
      expect(info.localDbUrl).toMatch(/^postgres:\/\//);
      expect(info.localDbUrl).toContain("localhost");
      expect(info.port).toBeGreaterThanOrEqual(15432);
      expect(info.port).toBeLessThanOrEqual(15532);
      expect(info.pgVersion).toBe(15);
    });

    it("throws when docker run fails", async () => {
      vi.mocked(runSpawnCommand).mockResolvedValue({
        stdout: "",
        stderr: "image not found",
        exitCode: 1,
      });
      await expect(startSessionContainer(16)).rejects.toThrow("Failed to start");
    });

    it("waits for postgres to become ready", async () => {
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "cid\n", stderr: "", exitCode: 0});
      // Fail twice then succeed
      vi.mocked(testConnection)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const info = await startSessionContainer(16);
      expect(testConnection).toHaveBeenCalledTimes(3);
      expect(info.containerID).toBe("cid");
    });
  });

  // ─── stopSessionContainer ─────────────────────────────────────────────────

  describe("stopSessionContainer()", () => {
    it("runs docker stop then docker rm", async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({stdout: "", stderr: "", exitCode: 0}) // stop
        .mockResolvedValueOnce({stdout: "", stderr: "", exitCode: 0}); // rm

      await stopSessionContainer("abc123");

      const calls = vi.mocked(runCommand).mock.calls;
      expect(calls[0]![0]).toContain("docker stop");
      expect(calls[0]![0]).toContain("abc123");
      expect(calls[1]![0]).toContain("docker rm");
      expect(calls[1]![0]).toContain("abc123");
    });
  });

  // ─── cloneDatabaseViaContainer ────────────────────────────────────────────

  describe("cloneDatabaseViaContainer()", () => {
    const containerID = "testcontainer123";
    const sourceUrl = "postgres://srcuser:srcpass@remote-host:5432/sourcedb";
    const targetUrl = "postgres://postgres:postkit_local@localhost:15432/postkit_local";

    it("runs pg_dump and psql inside the container via docker exec", async () => {
      vi.mocked(runPipedCommands).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});

      await cloneDatabaseViaContainer(containerID, sourceUrl, targetUrl);

      expect(runPipedCommands).toHaveBeenCalledTimes(1);
      const [producer, consumer] = vi.mocked(runPipedCommands).mock.calls[0]!;

      // Producer: docker exec ... pg_dump
      expect(producer.args[0]).toBe("docker");
      expect(producer.args).toContain("exec");
      expect(producer.args).toContain(containerID);
      expect(producer.args).toContain("pg_dump");
      expect(producer.args).toContain("remote-host");
      expect(producer.args).toContain("sourcedb");

      // Consumer: docker exec ... psql
      expect(consumer.args[0]).toBe("docker");
      expect(consumer.args).toContain("exec");
      expect(consumer.args).toContain(containerID);
      expect(consumer.args).toContain("psql");
    });

    it("psql connects to container-internal localhost:5432, not the mapped port", async () => {
      vi.mocked(runPipedCommands).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});

      await cloneDatabaseViaContainer(containerID, sourceUrl, targetUrl);

      const [, consumer] = vi.mocked(runPipedCommands).mock.calls[0]!;
      expect(consumer.args).toContain("localhost");
      expect(consumer.args).toContain("5432");
      // Must NOT use the external mapped port (15432)
      expect(consumer.args).not.toContain("15432");
    });

    it("passes PGPASSWORD for source via -e flag in docker exec args", async () => {
      vi.mocked(runPipedCommands).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});

      await cloneDatabaseViaContainer(containerID, sourceUrl, targetUrl);

      const [producer] = vi.mocked(runPipedCommands).mock.calls[0]!;
      const envFlag = producer.args.findIndex((a) => a === "-e");
      expect(envFlag).not.toBe(-1);
      expect(producer.args[envFlag + 1]).toContain("PGPASSWORD=srcpass");
    });

    it("throws on non-zero exit code", async () => {
      vi.mocked(runPipedCommands).mockResolvedValue({
        stdout: "",
        stderr: "dump error",
        exitCode: 1,
      });

      await expect(
        cloneDatabaseViaContainer(containerID, sourceUrl, targetUrl),
      ).rejects.toThrow("Failed to clone database via container");
    });
  });

  // ─── resolveLocalDb ───────────────────────────────────────────────────────

  describe("resolveLocalDb()", () => {
    const remoteUrl = "postgres://user:pass@remote-host:5432/mydb";
    const mockSpinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      text: "",
    } as any;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(getRemotePgMajorVersion).mockResolvedValue(16);
    });

    it("returns existing URL directly without touching Docker", async () => {
      const result = await resolveLocalDb(
        "postgres://localhost:5432/mydb",
        remoteUrl,
        mockSpinner,
      );
      expect(result.url).toBe("postgres://localhost:5432/mydb");
      expect(result.containerID).toBeUndefined();
      expect(commandExists).not.toHaveBeenCalled();
      expect(getRemotePgMajorVersion).not.toHaveBeenCalled();
    });

    it("fetches PG version from remoteUrl and starts a container when localDbUrl is empty", async () => {
      vi.mocked(commandExists).mockResolvedValue(true);
      vi.mocked(runCommand).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "newcontainer\n", stderr: "", exitCode: 0});
      vi.mocked(testConnection).mockResolvedValue(true);

      const result = await resolveLocalDb("", remoteUrl, mockSpinner);

      expect(getRemotePgMajorVersion).toHaveBeenCalledWith(remoteUrl);
      expect(result.containerID).toBe("newcontainer");
      expect(result.url).toMatch(/^postgres:\/\//);
      expect(result.url).toContain("localhost");
    });

    it("propagates PostkitError when Docker is not available", async () => {
      vi.mocked(commandExists).mockResolvedValue(false);

      await expect(resolveLocalDb("", remoteUrl, mockSpinner)).rejects.toThrow("Docker not found");
    });

    it("uses custom spinnerText when provided", async () => {
      vi.mocked(commandExists).mockResolvedValue(true);
      vi.mocked(runCommand).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "cid\n", stderr: "", exitCode: 0});
      vi.mocked(testConnection).mockResolvedValue(true);

      await resolveLocalDb("", remoteUrl, mockSpinner, "Custom spinner text");

      expect(mockSpinner.text).toBe("Custom spinner text");
    });
  });
});
