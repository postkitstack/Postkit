import {describe, it, expect, vi, beforeEach} from "vitest";

// ---------------------------------------------------------------------------
// pg mock — Client must be mockable as a constructor (new Client(...)).
// Vitest requires a real function (not arrow) when called with `new`.
// We use a module-level mock object so its methods can be reset in beforeEach.
// ---------------------------------------------------------------------------
const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({rows: [], rowCount: 0}),
  end: vi.fn().mockResolvedValue(undefined),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("pg", () => ({
  // Use a regular function (not arrow) so `new Client(...)` works.
  // The function returns mockClient from the outer scope via closure.
  Client: vi.fn(function MockClient() {
    return mockClient;
  }),
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

vi.mock("../../../../src/modules/db/services/infra-generator", () => ({
  applyInfraStep: vi.fn(),
}));

vi.mock("../../../../src/modules/db/services/dbmate", () => ({
  runCommittedMigrate: vi.fn(),
}));

vi.mock("../../../../src/modules/db/services/seed-generator", () => ({
  applySeedsStep: vi.fn(),
}));

import {Client} from "pg";
import ora from "ora";
import {applyInfraStep} from "../../../../src/modules/db/services/infra-generator";
import {runCommittedMigrate} from "../../../../src/modules/db/services/dbmate";
import {applySeedsStep} from "../../../../src/modules/db/services/seed-generator";
import {buildPgUrl, applyStackDeploy} from "../../../../src/modules/stack/services/db-init";
import type {StackConfig} from "../../../../src/modules/stack/types/config";

function makeConfig(overrides: Partial<StackConfig> = {}): StackConfig {
  return {
    postgres: {
      image: "postgres:16-alpine",
      enabled: true,
      port: 25432,
      user: "pguser",
      password: "pgpass",
      database: "testdb",
      pgVersion: 16,
      volume: "postkit-pgdata",
    },
    keycloak: {
      image: "quay.io/keycloak/keycloak:26.6",
      enabled: true,
      port: 28080,
      adminUser: "admin",
      adminPassword: "admin-pass",
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
    ...overrides,
  };
}

function makeSpinner() {
  return {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  } as unknown as ReturnType<typeof ora>;
}

describe("db-init", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    // Restore default happy-path behaviour after clearAllMocks() wipes implementations.
    // Re-apply the constructor factory (must use regular function, not arrow).
    vi.mocked(Client).mockImplementation(function MockClient() {
      return mockClient as any;
    } as any);
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({rows: [], rowCount: 0});
    mockClient.end.mockResolvedValue(undefined);
  });

  describe("buildPgUrl()", () => {
    it("builds correct postgres URL from config", () => {
      const config = makeConfig();
      const url = buildPgUrl(config);
      expect(url).toBe("postgres://pguser:pgpass@localhost:25432/testdb");
    });

    it("URL-encodes special characters in password", () => {
      const config = makeConfig({
        postgres: {
          image: "postgres:16-alpine",
          enabled: true,
          port: 25432,
          user: "pguser",
          password: "p@ss#word!",
          database: "testdb",
          pgVersion: 16,
          volume: "postkit-pgdata",
        },
      });
      const url = buildPgUrl(config);
      // encodeURIComponent encodes @, #, !
      expect(url).toContain("p%40ss%23word!");
      expect(url).not.toContain("p@ss");
    });

    it("uses localhost as host", () => {
      const config = makeConfig();
      const url = buildPgUrl(config);
      expect(url).toContain("@localhost:");
    });

    it("includes port from config", () => {
      const config = makeConfig();
      const url = buildPgUrl(config);
      expect(url).toContain(":25432/");
    });

    it("includes database name from config", () => {
      const config = makeConfig();
      const url = buildPgUrl(config);
      expect(url).toContain("/testdb");
    });
  });

  describe("applyStackDeploy()", () => {
    it("connects to postgres and creates postkit schema + table", async () => {
      vi.mocked(applyInfraStep).mockResolvedValue(undefined);
      vi.mocked(runCommittedMigrate).mockResolvedValue({success: true, output: ""});
      vi.mocked(applySeedsStep).mockResolvedValue(undefined);

      const config = makeConfig();
      const spinner = makeSpinner();

      await applyStackDeploy(config, spinner);

      expect(mockClient.connect).toHaveBeenCalledOnce();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("CREATE SCHEMA IF NOT EXISTS postkit"),
      );
    });

    it("closes client connection after schema query", async () => {
      vi.mocked(applyInfraStep).mockResolvedValue(undefined);
      vi.mocked(runCommittedMigrate).mockResolvedValue({success: true, output: ""});
      vi.mocked(applySeedsStep).mockResolvedValue(undefined);

      const config = makeConfig();
      const spinner = makeSpinner();

      await applyStackDeploy(config, spinner);

      expect(mockClient.end).toHaveBeenCalled();
    });

    it("calls applyInfraStep for phase 1", async () => {
      vi.mocked(applyInfraStep).mockResolvedValue(undefined);
      vi.mocked(runCommittedMigrate).mockResolvedValue({success: true, output: ""});
      vi.mocked(applySeedsStep).mockResolvedValue(undefined);

      const config = makeConfig();
      const spinner = makeSpinner();

      await applyStackDeploy(config, spinner);

      expect(applyInfraStep).toHaveBeenCalledOnce();
      expect(applyInfraStep).toHaveBeenCalledWith(
        spinner,
        expect.stringContaining("postgres://"),
        "stack",
      );
    });

    it("calls runCommittedMigrate for phase 2", async () => {
      vi.mocked(applyInfraStep).mockResolvedValue(undefined);
      vi.mocked(runCommittedMigrate).mockResolvedValue({success: true, output: ""});
      vi.mocked(applySeedsStep).mockResolvedValue(undefined);

      const config = makeConfig();
      const spinner = makeSpinner();

      await applyStackDeploy(config, spinner);

      expect(runCommittedMigrate).toHaveBeenCalledOnce();
      expect(runCommittedMigrate).toHaveBeenCalledWith(
        expect.stringContaining("postgres://"),
      );
    });

    it("calls applySeedsStep for phase 3", async () => {
      vi.mocked(applyInfraStep).mockResolvedValue(undefined);
      vi.mocked(runCommittedMigrate).mockResolvedValue({success: true, output: ""});
      vi.mocked(applySeedsStep).mockResolvedValue(undefined);

      const config = makeConfig();
      const spinner = makeSpinner();

      await applyStackDeploy(config, spinner);

      expect(applySeedsStep).toHaveBeenCalledOnce();
      expect(applySeedsStep).toHaveBeenCalledWith(
        spinner,
        expect.stringContaining("postgres://"),
        "stack",
      );
    });

    it("retries pg connection on failure and succeeds on later attempt", async () => {
      // First 2 attempts fail, 3rd succeeds — all using the same shared mockClient object.
      // We override connect to fail twice then succeed.
      let callCount = 0;
      mockClient.connect.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error("ECONNREFUSED"));
        }
        return Promise.resolve();
      });

      vi.mocked(applyInfraStep).mockResolvedValue(undefined);
      vi.mocked(runCommittedMigrate).mockResolvedValue({success: true, output: ""});
      vi.mocked(applySeedsStep).mockResolvedValue(undefined);

      vi.useFakeTimers();
      const config = makeConfig();
      const spinner = makeSpinner();

      const deployPromise = applyStackDeploy(config, spinner);
      await vi.runAllTimersAsync();
      await deployPromise;

      // connect was called at least 3 times (2 failures + 1 success)
      expect(mockClient.connect).toHaveBeenCalledTimes(3);
    });

    it("throws after all retries exhausted", async () => {
      mockClient.connect.mockRejectedValue(new Error("ECONNREFUSED"));

      vi.useFakeTimers();
      const config = makeConfig();
      const spinner = makeSpinner();

      // Capture the error immediately so no unhandled rejection leaks out
      let caughtError: unknown;
      const deployPromise = applyStackDeploy(config, spinner).catch((err) => {
        caughtError = err;
      });
      await vi.runAllTimersAsync();
      await deployPromise;

      expect(caughtError).toBeDefined();
      expect((caughtError as Error).message).toBeTruthy();
    });

    it("does not throw when runCommittedMigrate reports no migration files found", async () => {
      vi.mocked(applyInfraStep).mockResolvedValue(undefined);
      vi.mocked(runCommittedMigrate).mockResolvedValue({
        success: false,
        output: "no migration files found",
      });
      vi.mocked(applySeedsStep).mockResolvedValue(undefined);

      const config = makeConfig();
      const spinner = makeSpinner();

      await expect(applyStackDeploy(config, spinner)).resolves.not.toThrow();
    });

    it("throws when runCommittedMigrate fails with non-trivial error", async () => {
      vi.mocked(applyInfraStep).mockResolvedValue(undefined);
      vi.mocked(runCommittedMigrate).mockResolvedValue({
        success: false,
        output: "syntax error at or near 'CREAT'",
      });
      vi.mocked(applySeedsStep).mockResolvedValue(undefined);

      const config = makeConfig();
      const spinner = makeSpinner();

      await expect(applyStackDeploy(config, spinner)).rejects.toThrow(/Migration failed/);
    });

    it("closes the pg client even when query throws", async () => {
      mockClient.query.mockRejectedValue(new Error("query error"));

      const config = makeConfig();
      const spinner = makeSpinner();

      await expect(applyStackDeploy(config, spinner)).rejects.toThrow("query error");
      expect(mockClient.end).toHaveBeenCalled();
    });
  });
});
