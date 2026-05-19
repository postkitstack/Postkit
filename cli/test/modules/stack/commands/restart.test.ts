import {describe, it, expect, vi, beforeEach} from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

vi.mock("../../../../src/modules/stack/services/docker-compose", () => ({
  composeRestart: vi.fn(),
}));

vi.mock("../../../../src/modules/stack/utils/stack-config", () => ({
  getStackConfig: vi.fn(),
  getComposeFilePath: vi.fn(() => "/project/.postkit/stack/docker-compose.yml"),
}));

vi.mock("../../../../src/modules/stack/services/health", () => ({
  waitForAllServices: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/common/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    heading: vi.fn(),
  },
}));

// ora must return a chainable spinner object
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

import fs from "fs";
import {composeRestart} from "../../../../src/modules/stack/services/docker-compose";
import {getStackConfig, getComposeFilePath} from "../../../../src/modules/stack/utils/stack-config";
import {logger} from "../../../../src/common/logger";
import {restartCommand} from "../../../../src/modules/stack/commands/restart";
import {PostkitError} from "../../../../src/common/errors";
import type {CommandOptions} from "../../../../src/common/types";
import type {StackConfig} from "../../../../src/modules/stack/types/config";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: CommandOptions = {verbose: false, dryRun: false, json: false};

function makeMockStackConfig(): StackConfig {
  return {
    postgres: {
      image: "postgres:16-alpine",
      enabled: true,
      port: 25432,
      user: "postgres",
      password: "secret",
      database: "postkit",
      pgVersion: 16,
      volume: "postkit-pgdata",
    },
    keycloak: {
      image: "quay.io/keycloak/keycloak:26.6",
      enabled: true,
      port: 28080,
      adminUser: "admin",
      adminPassword: "kcpass",
      realm: "postkit",
      clientRealm: "postkit",
      volume: "postkit-keycloak-data",
      realmTemplate: "",
    },
    postgrest: {
      image: "postgrest/postgrest:latest",
      enabled: true,
      port: 3000,
      dbSchema: "public",
      dbAnonRole: "anon",
    },
    traefik: {
      image: "traefik:v3.3",
      enabled: true,
      httpPort: 80,
      dashboardPort: 8080,
    },
    network: "postkit-net",
    jwks: {keys: []},
    keycloakClients: [],
  };
}

const SUCCESS_RESULT = {stdout: "", stderr: "", exitCode: 0};
const FAILURE_RESULT = {stdout: "", stderr: "restart failed", exitCode: 1};

// ---------------------------------------------------------------------------
// restartCommand()
// ---------------------------------------------------------------------------

describe("restartCommand()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Compose file exists by default
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(getComposeFilePath).mockReturnValue(
      "/project/.postkit/stack/docker-compose.yml",
    );
    vi.mocked(getStackConfig).mockReturnValue(makeMockStackConfig());
    vi.mocked(composeRestart).mockResolvedValue(SUCCESS_RESULT);
  });

  describe("when compose file does not exist", () => {
    it("throws PostkitError when no stack found", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(restartCommand(DEFAULT_OPTIONS)).rejects.toThrow(PostkitError);
      await expect(restartCommand(DEFAULT_OPTIONS)).rejects.toThrow("No stack found");
    });
  });

  describe("with unknown services", () => {
    it("throws PostkitError with clear message for unknown service name", async () => {
      await expect(
        restartCommand(DEFAULT_OPTIONS, ["unknown-service"]),
      ).rejects.toThrow(PostkitError);
      await expect(
        restartCommand(DEFAULT_OPTIONS, ["unknown-service"]),
      ).rejects.toThrow("Unknown service(s): unknown-service");
    });

    it("includes available services in error hint", async () => {
      let thrown: PostkitError | undefined;
      try {
        await restartCommand(DEFAULT_OPTIONS, ["bad-service"]);
      } catch (e) {
        thrown = e as PostkitError;
      }
      expect(thrown).toBeInstanceOf(PostkitError);
      expect(thrown!.hint).toContain("Available services");
    });
  });

  describe("restarting all services", () => {
    it("restarts all services when no service args provided", async () => {
      await restartCommand(DEFAULT_OPTIONS, []);

      expect(composeRestart).toHaveBeenCalledWith(
        "/project/.postkit/stack/docker-compose.yml",
        undefined,
      );
    });

    it("calls composeRestart with the compose file path", async () => {
      await restartCommand(DEFAULT_OPTIONS);

      expect(composeRestart).toHaveBeenCalledWith(
        "/project/.postkit/stack/docker-compose.yml",
        undefined,
      );
    });
  });

  describe("restarting specific services", () => {
    it("restarts only specified services when args given", async () => {
      await restartCommand(DEFAULT_OPTIONS, ["postgres"]);

      expect(composeRestart).toHaveBeenCalledWith(
        "/project/.postkit/stack/docker-compose.yml",
        ["postgres"],
      );
    });

    it("passes multiple specified services to composeRestart", async () => {
      await restartCommand(DEFAULT_OPTIONS, ["postgres", "keycloak"]);

      expect(composeRestart).toHaveBeenCalledWith(
        "/project/.postkit/stack/docker-compose.yml",
        ["postgres", "keycloak"],
      );
    });

    it("accepts all valid service names", async () => {
      const validServices = ["postgres", "keycloak", "postgrest", "traefik"];
      for (const svc of validServices) {
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(getStackConfig).mockReturnValue(makeMockStackConfig());
        vi.mocked(composeRestart).mockResolvedValue(SUCCESS_RESULT);

        await expect(restartCommand(DEFAULT_OPTIONS, [svc])).resolves.not.toThrow();
      }
    });
  });

  describe("dry-run mode", () => {
    it("logs intent without calling composeRestart", async () => {
      await restartCommand({...DEFAULT_OPTIONS, dryRun: true});

      expect(composeRestart).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Dry run"));
    });

    it("logs the services that would be restarted", async () => {
      await restartCommand({...DEFAULT_OPTIONS, dryRun: true}, ["postgres"]);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("postgres"));
    });
  });

  describe("on non-zero exit from composeRestart", () => {
    it("does not throw but reports failure via spinner", async () => {
      vi.mocked(composeRestart).mockResolvedValue(FAILURE_RESULT);

      // Should not throw even when exitCode !== 0
      await expect(restartCommand(DEFAULT_OPTIONS)).resolves.not.toThrow();
    });

    it("logs the stderr output on failure", async () => {
      vi.mocked(composeRestart).mockResolvedValue(FAILURE_RESULT);

      await restartCommand(DEFAULT_OPTIONS);

      expect(logger.error).toHaveBeenCalledWith("restart failed");
    });
  });

  describe("on successful restart", () => {
    it("calls getStackConfig for health check after restart", async () => {
      await restartCommand(DEFAULT_OPTIONS, ["postgres"]);

      expect(getStackConfig).toHaveBeenCalled();
    });
  });
});
