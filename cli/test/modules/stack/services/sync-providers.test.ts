import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/common/config", () => ({
  projectRoot: "/project",
  cliRoot: "/cli",
  getPostkitAuthDir: vi.fn(() => "/project/.postkit/auth"),
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    copyFileSync: vi.fn(),
  },
}));

import fs from "fs";
import {getProvidersDir, syncKeycloakProviders} from "../../../../src/modules/stack/services/sync-providers";
import {getPostkitAuthDir} from "../../../../src/common/config";

describe("sync-providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProvidersDir()", () => {
    it("returns a path ending in .postkit/auth/providers", () => {
      vi.mocked(getPostkitAuthDir).mockReturnValue("/project/.postkit/auth");
      const dir = getProvidersDir();
      expect(dir).toMatch(/\.postkit[\\/]auth[\\/]providers$/);
    });
  });

  describe("syncKeycloakProviders()", () => {
    it("creates target providers directory", () => {
      vi.mocked(getPostkitAuthDir).mockReturnValue("/project/.postkit/auth");
      // vendor dir does not exist, project dir does not exist
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      syncKeycloakProviders();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("providers"),
        {recursive: true},
      );
    });

    it("copies .jar files from vendor/providers/ to target dir", () => {
      vi.mocked(getPostkitAuthDir).mockReturnValue("/project/.postkit/auth");
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // vendor dir exists, project providers dir does not
        return pathStr.includes("vendor/providers");
      });
      vi.mocked(fs.readdirSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes("vendor/providers")) {
          return ["plugin.jar", "another.jar"] as any;
        }
        return [] as any;
      });

      syncKeycloakProviders();

      expect(fs.copyFileSync).toHaveBeenCalledTimes(2);
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        expect.stringContaining("plugin.jar"),
        expect.stringContaining("providers"),
      );
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        expect.stringContaining("another.jar"),
        expect.stringContaining("providers"),
      );
    });

    it("skips non-JAR files in vendor dir", () => {
      vi.mocked(getPostkitAuthDir).mockReturnValue("/project/.postkit/auth");
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes("vendor/providers");
      });
      vi.mocked(fs.readdirSync).mockImplementation((p) => {
        if (String(p).includes("vendor/providers")) {
          return ["readme.txt", "plugin.jar", "config.xml"] as any;
        }
        return [] as any;
      });

      syncKeycloakProviders();

      expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        expect.stringContaining("plugin.jar"),
        expect.any(String),
      );
    });

    it("silently returns when vendor/providers/ directory does not exist", () => {
      vi.mocked(getPostkitAuthDir).mockReturnValue("/project/.postkit/auth");
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => syncKeycloakProviders()).not.toThrow();
      expect(fs.copyFileSync).not.toHaveBeenCalled();
    });

    it("copies project-specific JARs from auth/providers/<name>/target/", () => {
      vi.mocked(getPostkitAuthDir).mockReturnValue("/project/.postkit/auth");
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // vendor dir does not exist, but project providers exist
        if (pathStr.includes("vendor/providers")) return false;
        if (pathStr.endsWith("auth/providers")) return true;
        if (pathStr.endsWith("target")) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith("auth/providers")) {
          return ["my-provider"] as any;
        }
        if (pathStr.endsWith("target")) {
          return ["my-provider.jar"] as any;
        }
        return [] as any;
      });

      syncKeycloakProviders();

      expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        expect.stringContaining("my-provider.jar"),
        expect.stringContaining("providers"),
      );
    });

    it("skips project provider directories that have no target/ folder", () => {
      vi.mocked(getPostkitAuthDir).mockReturnValue("/project/.postkit/auth");
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes("vendor/providers")) return false;
        if (pathStr.endsWith("auth/providers")) return true;
        // target does not exist
        if (pathStr.endsWith("target")) return false;
        return false;
      });
      vi.mocked(fs.readdirSync).mockImplementation((p) => {
        if (String(p).endsWith("auth/providers")) {
          return ["my-provider"] as any;
        }
        return [] as any;
      });

      syncKeycloakProviders();

      expect(fs.copyFileSync).not.toHaveBeenCalled();
    });
  });
});
