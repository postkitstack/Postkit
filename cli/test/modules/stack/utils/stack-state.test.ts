import {describe, it, expect, vi, beforeEach} from "vitest";

// ---------------------------------------------------------------------------
// pg mock — Client is vi.fn() with no default implementation.
// Each test calls vi.mocked(Client).mockImplementation(function() {...})
// NOTE: Must use regular `function` keyword (not arrow) — Vitest requires
// constructable functions when using `new` with mocked classes.
// ---------------------------------------------------------------------------
vi.mock("pg", () => ({
  Client: vi.fn(),
}));

// Mock buildPgUrl so we don't need a real DB config
vi.mock("../../../../src/modules/stack/services/db-init", () => ({
  buildPgUrl: vi.fn(function() { return "postgres://postgres:secret@localhost:25432/postkit"; }),
}));

import {Client} from "pg";
import {readStackIsInitial, setStackInitialized} from "../../../../src/modules/stack/utils/stack-state";
import type {StackConfig} from "../../../../src/modules/stack/types/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockClient(overrides: {
  connectError?: Error;
  queryResult?: {rows: {value: string}[]; rowCount: number};
  queryError?: Error;
} = {}) {
  return {
    connect: overrides.connectError
      ? vi.fn().mockRejectedValue(overrides.connectError)
      : vi.fn().mockResolvedValue(undefined),
    query: overrides.queryError
      ? vi.fn().mockRejectedValue(overrides.queryError)
      : vi.fn().mockResolvedValue(overrides.queryResult ?? {rows: [], rowCount: 0}),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockConfig(): StackConfig {
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

// Helper to mock Client constructor using a regular function (required by Vitest)
function setupClientMock(mockClient: ReturnType<typeof makeMockClient>) {
  vi.mocked(Client).mockImplementation(function() {
    return mockClient as any;
  } as any);
}

// ---------------------------------------------------------------------------
// readStackIsInitial()
// ---------------------------------------------------------------------------

describe("readStackIsInitial()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when no row exists (empty result set)", async () => {
    const mockClient = makeMockClient({queryResult: {rows: [], rowCount: 0}});
    setupClientMock(mockClient);

    const result = await readStackIsInitial(makeMockConfig());

    expect(result).toBe(true);
  });

  it("returns false when row has value = 'false'", async () => {
    const mockClient = makeMockClient({
      queryResult: {rows: [{value: "false"}], rowCount: 1},
    });
    setupClientMock(mockClient);

    const result = await readStackIsInitial(makeMockConfig());

    expect(result).toBe(false);
  });

  it("returns true when row has value = 'true'", async () => {
    const mockClient = makeMockClient({
      queryResult: {rows: [{value: "true"}], rowCount: 1},
    });
    setupClientMock(mockClient);

    const result = await readStackIsInitial(makeMockConfig());

    expect(result).toBe(true);
  });

  it("returns true when DB query throws (table doesn't exist yet)", async () => {
    const mockClient = makeMockClient({
      queryError: new Error("relation does not exist"),
    });
    setupClientMock(mockClient);

    const result = await readStackIsInitial(makeMockConfig());

    expect(result).toBe(true);
  });

  it("returns true when connect throws", async () => {
    const mockClient = makeMockClient({
      connectError: new Error("connection refused"),
    });
    setupClientMock(mockClient);

    const result = await readStackIsInitial(makeMockConfig());

    expect(result).toBe(true);
  });

  it("closes pg client even on query error", async () => {
    const mockClient = makeMockClient({
      queryError: new Error("some query error"),
    });
    setupClientMock(mockClient);

    await readStackIsInitial(makeMockConfig());

    expect(mockClient.end).toHaveBeenCalledTimes(1);
  });

  it("closes pg client on success", async () => {
    const mockClient = makeMockClient({queryResult: {rows: [], rowCount: 0}});
    setupClientMock(mockClient);

    await readStackIsInitial(makeMockConfig());

    expect(mockClient.end).toHaveBeenCalledTimes(1);
  });

  it("queries the correct table and key", async () => {
    const mockClient = makeMockClient({queryResult: {rows: [], rowCount: 0}});
    setupClientMock(mockClient);

    await readStackIsInitial(makeMockConfig());

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("postkit.stack_config"),
      ["is_initial"],
    );
  });
});

// ---------------------------------------------------------------------------
// setStackInitialized()
// ---------------------------------------------------------------------------

describe("setStackInitialized()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes upsert with value = 'false'", async () => {
    const mockClient = makeMockClient();
    setupClientMock(mockClient);

    await setStackInitialized(makeMockConfig());

    const call = mockClient.query.mock.calls[0]!;
    const sql = call[0] as string;
    const params = call[1] as string[];

    expect(sql).toContain("INSERT INTO postkit.stack_config");
    expect(sql).toContain("'false'");
    expect(sql.toLowerCase()).toContain("on conflict");
    expect(params).toContain("is_initial");
  });

  it("closes pg client even when query throws", async () => {
    const mockClient = makeMockClient({
      queryError: new Error("insert failed"),
    });
    setupClientMock(mockClient);

    await expect(setStackInitialized(makeMockConfig())).rejects.toThrow("insert failed");

    expect(mockClient.end).toHaveBeenCalledTimes(1);
  });

  it("closes pg client on success", async () => {
    const mockClient = makeMockClient();
    setupClientMock(mockClient);

    await setStackInitialized(makeMockConfig());

    expect(mockClient.end).toHaveBeenCalledTimes(1);
  });

  it("connects before querying", async () => {
    const mockClient = makeMockClient();
    setupClientMock(mockClient);

    await setStackInitialized(makeMockConfig());

    const connectOrder = mockClient.connect.mock.invocationCallOrder[0]!;
    const queryOrder = mockClient.query.mock.invocationCallOrder[0]!;

    expect(connectOrder).toBeLessThan(queryOrder);
  });
});
