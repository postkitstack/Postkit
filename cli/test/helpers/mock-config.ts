import {vi} from "vitest";
import type {PostkitConfig, DbInputConfig} from "../../src/common/config";

/**
 * Creates a mock PostkitConfig with sensible defaults.
 * Override any property via the `overrides` parameter.
 */
export function createMockConfig(
  overrides: Partial<PostkitConfig> = {},
): PostkitConfig {
  const defaultDb: DbInputConfig = {
    localDbUrl: "postgres://localhost:5432/postkit_local",
    schemaPath: "schema",
    schema: "public",
    remotes: {
      dev: {
        url: "postgres://user:pass@dev-host:5432/postkit_dev",
        default: true,
        addedAt: "2024-01-01T00:00:00.000Z",
      },
      staging: {
        url: "postgres://user:pass@staging-host:5432/postkit_staging",
        addedAt: "2024-01-01T00:00:00.000Z",
      },
    },
  };

  return {
    db: defaultDb,
    auth: {
      source: {
        url: "http://keycloak-source:8080",
        adminUser: "admin",
        adminPass: "admin",
        realm: "test-realm",
      },
      target: {
        url: "http://keycloak-target:8080",
        adminUser: "admin",
        adminPass: "admin",
      },
    },
    ...overrides,
  };
}

/**
 * Creates a mock config JSON string.
 */
export function createMockConfigJson(
  overrides: Partial<PostkitConfig> = {},
): string {
  return JSON.stringify(createMockConfig(overrides), null, 2);
}

/**
 * Sets up the config module mock to return the given config.
 * Call this at the top of a test file that uses `vi.mock(...)`.
 */
export function mockLoadPostkitConfig(
  config: PostkitConfig = createMockConfig(),
) {
  return vi.fn().mockReturnValue(config);
}
