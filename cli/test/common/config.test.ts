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

    it("returns parsed JSON when config exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      const config = loadPostkitConfig();
      expect(config.db.localDbUrl).toBe("postgres://localhost:5432/test");
    });

    it("caches config (same reference on second call)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      const first = loadPostkitConfig();
      const second = loadPostkitConfig();
      expect(first).toBe(second);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it("invalidateConfig() clears cache", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      loadPostkitConfig();
      invalidateConfig();
      loadPostkitConfig();
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it("auto-migrates remoteDbUrl to remotes.default", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        db: {localDbUrl: "postgres://localhost:5432/test", remoteDbUrl: "postgres://remote:5432/test"},
      }));
      const config = loadPostkitConfig();
      expect(config.db.remotes.default).toBeDefined();
      expect(config.db.remotes.default.url).toBe("postgres://remote:5432/test");
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("auto-migrates environments to named remotes", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        db: {localDbUrl: "postgres://localhost:5432/test", environments: {staging: "postgres://staging:5432/test"}},
      }));
      const config = loadPostkitConfig();
      expect(config.db.remotes.staging).toBeDefined();
      expect(config.db.environments).toBeUndefined();
    });

    it("does not re-migrate if remotes already exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      loadPostkitConfig();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
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

    it("getVendorDir() ends with vendor", () => {
      expect(getVendorDir()).toMatch(/vendor$/);
    });
  });
});
