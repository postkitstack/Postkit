import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/common/config", () => ({
  loadPostkitConfig: vi.fn(),
  projectRoot: "/project",
  cliRoot: "/cli",
  getPostkitAuthDir: vi.fn(() => "/project/.postkit/auth"),
}));

vi.mock("../../../../src/modules/stack/utils/stack-config", () => ({
  getStackDir: vi.fn(() => "/project/.postkit/stack"),
}));

vi.mock("../../../../src/modules/stack/services/sync-providers", () => ({
  getProvidersDir: vi.fn(() => "/project/.postkit/auth/providers"),
}));

vi.mock("fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import {loadPostkitConfig} from "../../../../src/common/config";
import {getProvidersDir} from "../../../../src/modules/stack/services/sync-providers";
import {
  getSelectedServices,
  generateComposeFile,
  ALL_SERVICES,
} from "../../../../src/modules/stack/services/compose";
import type {StackConfig} from "../../../../src/modules/stack/types/config";

function makeConfig(overrides: Partial<StackConfig> = {}): StackConfig {
  return {
    postgres: {
      image: "postgres:${pgVersion}-alpine",
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

describe("compose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadPostkitConfig).mockReturnValue({
      name: "myproject",
      db: {} as any,
      auth: {} as any,
    });
    vi.mocked(getProvidersDir).mockReturnValue("/project/.postkit/auth/providers");
  });

  describe("getSelectedServices()", () => {
    it("returns all enabled services when no requested services provided", () => {
      const config = makeConfig();
      const result = getSelectedServices(config, []);
      // All 4 services are enabled by default
      expect(result).toEqual(expect.arrayContaining(["postgres", "keycloak", "postgrest", "traefik"]));
      expect(result).toHaveLength(4);
    });

    it("auto-adds postgres and traefik when keycloak is requested", () => {
      const config = makeConfig();
      const result = getSelectedServices(config, ["keycloak"]);
      expect(result).toContain("postgres");
      expect(result).toContain("traefik");
      expect(result).toContain("keycloak");
    });

    it("auto-adds postgres and traefik when postgrest is requested", () => {
      const config = makeConfig();
      const result = getSelectedServices(config, ["postgrest"]);
      expect(result).toContain("postgres");
      expect(result).toContain("traefik");
      expect(result).toContain("postgrest");
    });

    it("explicit keycloak results in postgres + traefik included", () => {
      const config = makeConfig();
      const result = getSelectedServices(config, ["keycloak"]);
      expect(result).toContain("postgres");
      expect(result).toContain("traefik");
      expect(result).toContain("keycloak");
    });

    it("throws on unknown service name", () => {
      const config = makeConfig();
      expect(() => getSelectedServices(config, ["unknown-service"])).toThrow(
        /Unknown service.*unknown-service/,
      );
    });

    it("returns only postgres when only postgres requested (no dep services)", () => {
      const config = makeConfig();
      const result = getSelectedServices(config, ["postgres"]);
      expect(result).toEqual(["postgres"]);
    });

    it("filters out disabled services when no requested services provided", () => {
      const config = makeConfig({
        postgrest: {
          image: "postgrest/postgrest:latest",
          enabled: false,
          port: 3000,
          dbSchema: "public",
          dbAnonRole: "anon",
        },
      });
      const result = getSelectedServices(config, []);
      // postgrest is disabled, but keycloak is still enabled so traefik/postgres get added
      expect(result).not.toContain("postgrest");
    });
  });

  describe("generateComposeFile()", () => {
    it("output includes 'name: <projectName>' line", () => {
      vi.mocked(loadPostkitConfig).mockReturnValue({
        name: "myapp",
        db: {} as any,
        auth: {} as any,
      });
      const config = makeConfig();
      const services = ALL_SERVICES.slice() as any;
      const output = generateComposeFile(config, services);
      expect(output).toMatch(/^name: myapp/m);
    });

    it("uses 'postkit' as project name when config.name is undefined", () => {
      vi.mocked(loadPostkitConfig).mockReturnValue({
        db: {} as any,
        auth: {} as any,
      });
      const config = makeConfig();
      const output = generateComposeFile(config, ["postgres"] as any);
      expect(output).toMatch(/^name: postkit/m);
    });

    it("output includes all 4 service blocks when all services selected", () => {
      const config = makeConfig();
      const services = ALL_SERVICES.slice() as any;
      const output = generateComposeFile(config, services);
      expect(output).toContain("  postgres:");
      expect(output).toContain("  keycloak:");
      expect(output).toContain("  postgrest:");
      expect(output).toContain("  traefik:");
    });

    it("network block has explicit 'name:' field", () => {
      const config = makeConfig();
      const output = generateComposeFile(config, ["postgres"] as any);
      expect(output).toContain("name: postkit-net");
    });

    it("renderKeycloak includes KC_DB_SCHEMA: auth", () => {
      const config = makeConfig();
      const output = generateComposeFile(config, ["keycloak", "postgres", "traefik"] as any);
      expect(output).toContain("KC_DB_SCHEMA: auth");
    });

    it("renderKeycloak includes KC_DB_POOL_MIN_SIZE and KC_DB_POOL_MAX_SIZE", () => {
      const config = makeConfig();
      const output = generateComposeFile(config, ["keycloak", "postgres", "traefik"] as any);
      expect(output).toContain("KC_DB_POOL_MIN_SIZE:");
      expect(output).toContain("KC_DB_POOL_MAX_SIZE:");
    });

    it("renderKeycloak includes providers volume mount", () => {
      vi.mocked(getProvidersDir).mockReturnValue("/project/.postkit/auth/providers");
      const config = makeConfig();
      const output = generateComposeFile(config, ["keycloak", "postgres", "traefik"] as any);
      expect(output).toContain("/project/.postkit/auth/providers:/opt/keycloak/providers");
    });

    it("only includes requested service blocks", () => {
      const config = makeConfig();
      const output = generateComposeFile(config, ["postgres"] as any);
      expect(output).toContain("  postgres:");
      expect(output).not.toContain("  keycloak:");
      expect(output).not.toContain("  postgrest:");
      expect(output).not.toContain("  traefik:");
    });

    it("volumes section includes postgres volume when postgres selected", () => {
      const config = makeConfig();
      const output = generateComposeFile(config, ["postgres"] as any);
      expect(output).toContain("postkit-pgdata:");
    });

    it("volumes section includes keycloak volume when keycloak selected", () => {
      const config = makeConfig();
      const output = generateComposeFile(config, ["keycloak", "postgres", "traefik"] as any);
      expect(output).toContain("postkit-keycloak-data:");
    });
  });
});
