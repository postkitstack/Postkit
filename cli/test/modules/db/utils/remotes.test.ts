import {describe, it, expect, vi, beforeEach} from "vitest";
import fs from "fs/promises";

vi.mock("../../../../src/common/config", async () => {
  const actual = await vi.importActual("../../../../src/common/config");
  return {
    ...actual,
    loadPostkitConfig: vi.fn(),
    getConfigFilePath: vi.fn(() => "/project/postkit.config.json"),
    invalidateConfig: vi.fn(),
  };
});

vi.mock("../../../../src/common/logger", () => ({
  logger: {success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()},
}));

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import {loadPostkitConfig, invalidateConfig} from "../../../../src/common/config";
import {
  getRemotes,
  getRemoteList,
  getRemote,
  getDefaultRemote,
  resolveRemote,
  resolveRemoteUrl,
  addRemote,
  removeRemote,
  setDefaultRemote,
  normalizeUrl,
  maskRemoteUrl,
} from "../../../../src/modules/db/utils/remotes";

const defaultMockConfig = {
  db: {
    localDbUrl: "postgres://localhost:5432/local",
    schemaPath: "schema",
    remotes: {
      dev: {url: "postgres://user:pass@dev-host:5432/db", default: true, addedAt: "2024-01-01T00:00:00.000Z"},
      staging: {url: "postgres://user:pass@staging-host:5432/db", addedAt: "2024-01-01T00:00:00.000Z"},
    },
  },
};

describe("remotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadPostkitConfig).mockReturnValue(defaultMockConfig as any);
  });

  describe("getRemotes()", () => {
    it("returns remotes from config", () => {
      const remotes = getRemotes();
      expect(remotes).toHaveProperty("dev");
      expect(remotes).toHaveProperty("staging");
    });

    it("throws when no remotes configured", () => {
      vi.mocked(loadPostkitConfig).mockReturnValueOnce({
        db: {localDbUrl: "postgres://localhost/db", remotes: {}},
      } as any);
      expect(() => getRemotes()).toThrow("No remotes configured");
    });
  });

  describe("getRemoteList()", () => {
    it("returns array of RemoteInfo", () => {
      const list = getRemoteList();
      expect(list).toHaveLength(2);
      const dev = list.find((r) => r.name === "dev");
      expect(dev!.isDefault).toBe(true);
    });
  });

  describe("getRemote()", () => {
    it("returns specific remote by name", () => {
      expect(getRemote("dev")!.url).toContain("dev-host");
    });

    it("returns null for missing remote", () => {
      expect(getRemote("missing")).toBeNull();
    });
  });

  describe("getDefaultRemote()", () => {
    it("returns default remote name", () => {
      expect(getDefaultRemote()).toBe("dev");
    });

    it("falls back to first remote when no default set", () => {
      vi.mocked(loadPostkitConfig).mockReturnValueOnce({
        db: {localDbUrl: "postgres://localhost/db", remotes: {alpha: {url: "postgres://a/db"}, beta: {url: "postgres://b/db"}}},
      } as any);
      expect(getDefaultRemote()).toBe("alpha");
    });
  });

  describe("resolveRemote()", () => {
    it("returns name and url for named remote", () => {
      expect(resolveRemote("staging")).toEqual({name: "staging", url: "postgres://user:pass@staging-host:5432/db"});
    });

    it("resolves to default when no name given", () => {
      expect(resolveRemote().name).toBe("dev");
    });

    it("throws for missing remote name", () => {
      expect(() => resolveRemote("missing")).toThrow("not found");
    });
  });

  describe("resolveRemoteUrl()", () => {
    it("returns default URL", () => {
      expect(resolveRemoteUrl()).toContain("dev-host");
    });

    it("returns named remote URL", () => {
      expect(resolveRemoteUrl("staging")).toContain("staging-host");
    });
  });

  describe("addRemote()", () => {
    it("writes new remote to config", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(defaultMockConfig));
      vi.mocked(fs.writeFile).mockResolvedValue();
      await addRemote("prod", "postgres://user:pass@prod-host:5432/db");
      expect(fs.writeFile).toHaveBeenCalled();
      expect(invalidateConfig).toHaveBeenCalled();
    });

    it("throws for empty name", async () => {
      await expect(addRemote("", "postgres://host/db")).rejects.toThrow("cannot be empty");
    });

    it("throws for invalid name", async () => {
      await expect(addRemote("bad!", "postgres://host/db")).rejects.toThrow("Invalid remote name");
    });

    it("throws for duplicate name", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(defaultMockConfig));
      await expect(addRemote("dev", "postgres://new/db")).rejects.toThrow("already exists");
    });

    it("throws for invalid URL", async () => {
      await expect(addRemote("new", "http://bad")).rejects.toThrow("Invalid database URL");
    });

    it("throws when URL matches local DB", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(defaultMockConfig));
      await expect(addRemote("new", "postgres://localhost:5432/local")).rejects.toThrow("matches local database");
    });
  });

  describe("removeRemote()", () => {
    it("removes remote and reassigns default", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(defaultMockConfig));
      vi.mocked(fs.writeFile).mockResolvedValue();
      await removeRemote("dev", true);
      const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
      expect(written.db.remotes.dev).toBeUndefined();
      expect(written.db.remotes.staging.default).toBe(true);
    });

    it("throws when removing the only remote", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        db: {localDbUrl: "postgres://localhost/db", remotes: {dev: {url: "postgres://dev/db", default: true}}},
      }));
      await expect(removeRemote("dev", true)).rejects.toThrow("only remaining remote");
    });
  });

  describe("setDefaultRemote()", () => {
    it("sets remote as default", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(defaultMockConfig));
      vi.mocked(fs.writeFile).mockResolvedValue();
      await setDefaultRemote("staging");
      const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
      expect(written.db.remotes.staging.default).toBe(true);
      expect(written.db.remotes.dev.default).toBeUndefined();
    });
  });

  describe("maskRemoteUrl()", () => {
    it("masks password", () => {
      expect(maskRemoteUrl("postgres://user:secret@host:5432/db")).toContain("****");
    });
  });

  describe("normalizeUrl()", () => {
    it("lowercases host and strips trailing slash", () => {
      const n = normalizeUrl("postgres://u:p@HOST:5432/db/");
      expect(n).toContain("host");
      expect(n).not.toMatch(/\/$/);
    });
  });
});
