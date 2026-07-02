import {describe, it, expect, vi, beforeEach} from "vitest";

// Mock fs BEFORE any imports that use it
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock("../../../../src/common/config", () => ({
  loadPostkitConfig: vi.fn(),
  getSecretsFilePath: vi.fn(() => "/project/postkit.secrets.json"),
  getPostkitDir: vi.fn(() => "/project/.postkit"),
}));

import fs from "fs";
import {loadPostkitConfig, getSecretsFilePath} from "../../../../src/common/config";
import {getStackConfig, ensureStackSecrets} from "../../../../src/modules/stack/utils/stack-config";
import type {StackConfig} from "../../../../src/modules/stack/types/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFullStackConfig(overrides: Partial<StackConfig> = {}): StackConfig {
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
      adminPassword: "kcsecret",
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
    jwk: undefined,
    clients: undefined,
    keycloakClients: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getStackConfig()
// ---------------------------------------------------------------------------

describe("getStackConfig()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No secrets file by default
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it("returns config with default port 25432 for postgres when none configured", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({stack: {}} as any);

    const cfg = getStackConfig();

    expect(cfg.postgres.port).toBe(25432);
  });

  it("returns all service defaults when stack config is empty", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({stack: {}} as any);

    const cfg = getStackConfig();

    expect(cfg.postgres.image).toBe("postgres:16-alpine");
    expect(cfg.postgres.enabled).toBe(true);
    expect(cfg.postgres.database).toBe("postkit");
    expect(cfg.postgres.user).toBe("postgres");
    expect(cfg.postgres.password).toBe("");
    expect(cfg.keycloak.port).toBe(28080);
    expect(cfg.keycloak.adminUser).toBe("admin");
    expect(cfg.keycloak.adminPassword).toBe("");
    expect(cfg.postgrest.port).toBe(3000);
    expect(cfg.traefik.httpPort).toBe(80);
    expect(cfg.traefik.dashboardPort).toBe(8080);
    expect(cfg.network).toBe("postkit-net");
  });

  it("merges user-supplied postgres port over the default", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({
      stack: {postgres: {port: 54321}},
    } as any);

    const cfg = getStackConfig();

    expect(cfg.postgres.port).toBe(54321);
  });

  it("reads postgres user and password from merged secrets in config", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({
      stack: {
        postgres: {user: "myuser", password: "mypass"},
      },
    } as any);

    const cfg = getStackConfig();

    expect(cfg.postgres.user).toBe("myuser");
    expect(cfg.postgres.password).toBe("mypass");
  });

  it("reads jwks from secrets file when it exists", () => {
    const jwks = {keys: [{kty: "oct", kid: "k1", alg: "HS256", k: "abc"}]};
    vi.mocked(loadPostkitConfig).mockReturnValue({stack: {}} as any);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({stack: {jwks}}) as any,
    );

    const cfg = getStackConfig();

    expect(cfg.jwks.keys).toHaveLength(1);
    expect(cfg.jwks.keys[0]!.kid).toBe("k1");
  });

  it("returns empty jwks when secrets file does not exist", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({stack: {}} as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const cfg = getStackConfig();

    expect(cfg.jwks).toEqual({keys: []});
  });

  it("throws when postgres port is out of valid range", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({
      stack: {postgres: {port: 99999}},
    } as any);

    expect(() => getStackConfig()).toThrow();
  });

  it("throws when postgres pgVersion is below minimum (12)", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({
      stack: {postgres: {pgVersion: 10}},
    } as any);

    expect(() => getStackConfig()).toThrow();
  });

  it("returns keycloakClients array from config", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({
      stack: {keycloak: {clients: ["app", "mobile"]}},
    } as any);

    const cfg = getStackConfig();

    expect(cfg.keycloakClients).toEqual(["app", "mobile"]);
  });

  it("returns empty keycloakClients when none configured", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({stack: {}} as any);

    const cfg = getStackConfig();

    expect(cfg.keycloakClients).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ensureStackSecrets()
// ---------------------------------------------------------------------------

describe("ensureStackSecrets()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSecretsFilePath).mockReturnValue("/project/postkit.secrets.json");
  });

  it("generates random postgres password when password is empty", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const config = makeFullStackConfig({
      postgres: {
        image: "postgres:16-alpine",
        enabled: true,
        port: 25432,
        user: "postgres",
        password: "",
        database: "postkit",
        pgVersion: 16,
        volume: "postkit-pgdata",
      },
    });

    const result = ensureStackSecrets(config);

    expect(result.postgres.password).toBeTruthy();
    expect(result.postgres.password.length).toBeGreaterThan(0);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("generates random keycloak adminPassword when adminPassword is empty", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const config = makeFullStackConfig({
      keycloak: {
        image: "quay.io/keycloak/keycloak:26.6",
        enabled: true,
        port: 28080,
        adminUser: "admin",
        adminPassword: "",
        realm: "postkit",
        clientRealm: "postkit",
        volume: "postkit-keycloak-data",
        realmTemplate: "",
      },
    });

    const result = ensureStackSecrets(config);

    expect(result.keycloak.adminPassword).toBeTruthy();
    expect(result.keycloak.adminPassword.length).toBeGreaterThan(0);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("preserves existing postgres password and does not overwrite it", () => {
    const existingSecrets = {
      stack: {
        postgres: {user: "postgres", password: "existing-pg-pass"},
        keycloak: {adminUser: "admin", adminPassword: "existing-kc-pass"},
        jwks: {keys: [{kty: "oct", kid: "k1", alg: "HS256", k: "akey"}], urlSigningKey: {kty: "oct", kid: "k1", alg: "HS256", k: "akey"}},
      },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingSecrets) as any);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const config = makeFullStackConfig({
      postgres: {
        image: "postgres:16-alpine",
        enabled: true,
        port: 25432,
        user: "postgres",
        password: "existing-pg-pass",
        database: "postkit",
        pgVersion: 16,
        volume: "postkit-pgdata",
      },
      keycloak: {
        image: "quay.io/keycloak/keycloak:26.6",
        enabled: true,
        port: 28080,
        adminUser: "admin",
        adminPassword: "existing-kc-pass",
        realm: "postkit",
        clientRealm: "postkit",
        volume: "postkit-keycloak-data",
        realmTemplate: "",
      },
    });

    const result = ensureStackSecrets(config);

    // Should NOT change existing passwords
    expect(result.postgres.password).toBe("existing-pg-pass");
    expect(result.keycloak.adminPassword).toBe("existing-kc-pass");
  });

  it("does not write secrets file when all secrets already exist", () => {
    const existingSecrets = {
      stack: {
        postgres: {user: "postgres", password: "existing-pg-pass"},
        keycloak: {adminUser: "admin", adminPassword: "existing-kc-pass"},
        jwks: {keys: [{kty: "oct", kid: "k1", alg: "HS256", k: "akey"}], urlSigningKey: {kty: "oct", kid: "k1", alg: "HS256", k: "akey"}},
      },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingSecrets) as any);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const config = makeFullStackConfig({
      postgres: {
        image: "postgres:16-alpine",
        enabled: true,
        port: 25432,
        user: "postgres",
        password: "existing-pg-pass",
        database: "postkit",
        pgVersion: 16,
        volume: "postkit-pgdata",
      },
      keycloak: {
        image: "quay.io/keycloak/keycloak:26.6",
        enabled: true,
        port: 28080,
        adminUser: "admin",
        adminPassword: "existing-kc-pass",
        realm: "postkit",
        clientRealm: "postkit",
        volume: "postkit-keycloak-data",
        realmTemplate: "",
      },
    });

    ensureStackSecrets(config);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("writes generated secrets to postkit.secrets.json", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    let writtenPath = "";
    let writtenContent = "";
    vi.mocked(fs.writeFileSync).mockImplementation((p, c) => {
      writtenPath = p as string;
      writtenContent = c as string;
    });

    const config = makeFullStackConfig({
      postgres: {
        image: "postgres:16-alpine",
        enabled: true,
        port: 25432,
        user: "postgres",
        password: "",
        database: "postkit",
        pgVersion: 16,
        volume: "postkit-pgdata",
      },
      keycloak: {
        image: "quay.io/keycloak/keycloak:26.6",
        enabled: true,
        port: 28080,
        adminUser: "admin",
        adminPassword: "",
        realm: "postkit",
        clientRealm: "postkit",
        volume: "postkit-keycloak-data",
        realmTemplate: "",
      },
    });

    ensureStackSecrets(config);

    expect(writtenPath).toBe("/project/postkit.secrets.json");
    const written = JSON.parse(writtenContent);
    expect(written.stack.postgres.password).toBeTruthy();
    expect(written.stack.keycloak.adminPassword).toBeTruthy();
  });

  it("generates jwks when absent from secrets", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        stack: {
          postgres: {user: "postgres", password: "pass"},
          keycloak: {adminUser: "admin", adminPassword: "kcpass"},
          // no jwks
        },
      }) as any,
    );
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const config = makeFullStackConfig({
      postgres: {
        image: "postgres:16-alpine",
        enabled: true,
        port: 25432,
        user: "postgres",
        password: "pass",
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
      jwks: {keys: []},
    });

    const result = ensureStackSecrets(config);

    expect(result.jwks.keys.length).toBeGreaterThan(0);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("returns the updated StackConfig", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const config = makeFullStackConfig({
      postgres: {
        image: "postgres:16-alpine",
        enabled: true,
        port: 25432,
        user: "postgres",
        password: "",
        database: "postkit",
        pgVersion: 16,
        volume: "postkit-pgdata",
      },
      keycloak: {
        image: "quay.io/keycloak/keycloak:26.6",
        enabled: true,
        port: 28080,
        adminUser: "admin",
        adminPassword: "",
        realm: "postkit",
        clientRealm: "postkit",
        volume: "postkit-keycloak-data",
        realmTemplate: "",
      },
    });

    const result = ensureStackSecrets(config);

    expect(result).toBeDefined();
    expect(result.postgres).toBeDefined();
    expect(result.keycloak).toBeDefined();
  });
});
