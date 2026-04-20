import {describe, it, expect, vi, beforeEach} from "vitest";

const validConfig = {
  db: {
    localDbUrl: "postgres://localhost:5432/test",
    remotes: {dev: {url: "postgres://dev:5432/test", default: true}},
  },
  auth: {
    source: {url: "http://kc-source:8080", adminUser: "admin", adminPass: "admin", realm: "myrealm"},
    target: {url: "http://kc-target:8080", adminUser: "admin", adminPass: "admin"},
  },
};

vi.mock("../../../../src/common/config", () => ({
  loadPostkitConfig: vi.fn(() => validConfig),
  getPostkitAuthDir: vi.fn(() => "/project/.postkit/auth"),
}));

import {getAuthConfig} from "../../../../src/modules/auth/utils/auth-config";
import {loadPostkitConfig} from "../../../../src/common/config";

describe("auth-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadPostkitConfig).mockReturnValue(validConfig as any);
  });

  it("returns resolved auth config", () => {
    const config = getAuthConfig();
    expect(config.sourceUrl).toBe("http://kc-source:8080");
    expect(config.targetUrl).toBe("http://kc-target:8080");
    expect(config.sourceRealm).toBe("myrealm");
  });

  it("uses default configCliImage when not specified", () => {
    const config = getAuthConfig();
    expect(config.configCliImage).toContain("keycloak-config-cli");
  });

  it("uses custom configCliImage when specified", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({
      ...validConfig,
      auth: {...validConfig.auth, configCliImage: "custom:1.0"},
    } as any);
    const config = getAuthConfig();
    expect(config.configCliImage).toBe("custom:1.0");
  });

  it("sets file paths from realm name", () => {
    const config = getAuthConfig();
    expect(config.rawFilePath).toContain("myrealm.json");
    expect(config.cleanFilePath).toContain("myrealm.json");
  });

  it("throws for invalid source config", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({
      ...validConfig,
      auth: {...validConfig.auth, source: {url: "", adminUser: "", adminPass: "", realm: ""}},
    } as any);
    expect(() => getAuthConfig()).toThrow("Invalid auth configuration");
  });

  it("throws for invalid target config", () => {
    vi.mocked(loadPostkitConfig).mockReturnValue({
      ...validConfig,
      auth: {...validConfig.auth, target: {url: "", adminUser: "", adminPass: ""}},
    } as any);
    expect(() => getAuthConfig()).toThrow("Invalid auth configuration");
  });
});
