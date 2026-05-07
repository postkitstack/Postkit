import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("fs", async () => {
  const {vi} = await import("vitest");
  const fns = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return {default: fns, ...fns};
});

import fs from "fs";
import {
  loadPostkitConfig,
  checkInitialized,
  invalidateConfig,
  getConfigFilePath,
  getSecretsFilePath,
  getVendorDir,
} from "../../src/common/config";

const mockConfig = {
  db: {
    localDbUrl: "postgres://localhost:5432/test",
    schemaPath: "schema",
    schema: "public",
    remotes: {
      dev: {url: "postgres://dev:5432/test", default: true, addedAt: "2024-01-01T00:00:00.000Z"},
    },
  },
};

/** Mock existsSync: config exists, secrets does not (single-file / legacy mode). */
function mockConfigOnly() {
  vi.mocked(fs.existsSync)
    .mockReturnValueOnce(true)   // postkit.config.json
    .mockReturnValueOnce(false); // postkit.secrets.json
}

describe("config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateConfig();
  });

  describe("loadPostkitConfig()", () => {
    it("throws when config file missing", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => loadPostkitConfig()).toThrow("Config file not found");
    });

    it("returns parsed JSON when config exists (no secrets file)", () => {
      mockConfigOnly();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      const config = loadPostkitConfig();
      expect(config.db.localDbUrl).toBe("postgres://localhost:5432/test");
    });

    it("caches config (same reference on second call)", () => {
      mockConfigOnly();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      const first = loadPostkitConfig();
      const second = loadPostkitConfig();
      expect(first).toBe(second);
      // readFileSync called once — only for the config file (secrets=false skips second read)
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it("invalidateConfig() clears cache", () => {
      // Two loads, each with config=true / secrets=false
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true).mockReturnValueOnce(false)
        .mockReturnValueOnce(true).mockReturnValueOnce(false);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      loadPostkitConfig();
      invalidateConfig();
      loadPostkitConfig();
      // One read per load = 2 total
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it("auto-migrates remoteDbUrl to remotes.default", () => {
      mockConfigOnly();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        db: {localDbUrl: "postgres://localhost:5432/test", remoteDbUrl: "postgres://remote:5432/test"},
      }));
      const config = loadPostkitConfig();
      expect(config.db.remotes!["default"]).toBeDefined();
      expect(config.db.remotes!["default"]!.url).toBe("postgres://remote:5432/test");
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("auto-migrates environments to named remotes", () => {
      mockConfigOnly();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        db: {localDbUrl: "postgres://localhost:5432/test", environments: {staging: "postgres://staging:5432/test"}},
      }));
      const config = loadPostkitConfig();
      expect(config.db.remotes!["staging"]).toBeDefined();
      expect((config.db as Record<string, unknown>)["environments"]).toBeUndefined();
    });

    it("does not re-migrate if remotes already exist", () => {
      mockConfigOnly();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      loadPostkitConfig();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("merges secrets file when both files exist", () => {
      // Public config has no remotes — all remote data lives in secrets
      const publicConfig = {
        db: {schemaPath: "schema", schema: "public"},
        auth: {configCliImage: "keycloak:latest"},
      };
      const secrets = {
        db: {
          localDbUrl: "postgres://localhost:5432/test",
          remotes: {dev: {url: "postgres://dev:5432/test", default: true, addedAt: "2024-01-01"}},
        },
        auth: {source: {url: "http://kc:8080", adminUser: "admin", adminPass: "pass", realm: "r"}},
      };
      vi.mocked(fs.existsSync).mockReturnValue(true); // both files exist
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(publicConfig)) // config file
        .mockReturnValueOnce(JSON.stringify(secrets));      // secrets file
      const config = loadPostkitConfig();
      // All remote data comes from secrets
      expect(config.db.localDbUrl).toBe("postgres://localhost:5432/test");
      expect(config.db.remotes!["dev"]!.url).toBe("postgres://dev:5432/test");
      expect(config.db.remotes!["dev"]!.default).toBe(true);
      // Public config values are preserved
      expect((config.auth as any).configCliImage).toBe("keycloak:latest");
    });
  });

  describe("checkInitialized()", () => {
    it("passes when config file exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(() => checkInitialized()).not.toThrow();
    });

    it("throws when config file missing", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => checkInitialized()).toThrow("not initialized");
    });
  });

  describe("path helpers", () => {
    it("getConfigFilePath() ends with postkit.config.json", () => {
      expect(getConfigFilePath()).toMatch(/postkit\.config\.json$/);
    });

    it("getSecretsFilePath() ends with postkit.secrets.json", () => {
      expect(getSecretsFilePath()).toMatch(/postkit\.secrets\.json$/);
    });

    it("getVendorDir() ends with vendor", () => {
      expect(getVendorDir()).toMatch(/vendor$/);
    });
  });
});
