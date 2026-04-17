import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/modules/db/utils/db-config", () => ({
  getDbConfig: vi.fn(() => ({
    localDbUrl: "postgres://localhost:5432/test",
    schemaPath: "/project/schema",
    schema: "public",
    remotes: {},
    cliRoot: "/cli",
    projectRoot: "/project",
  })),
}));

vi.mock("../../../../src/modules/db/utils/sql-loader", () => ({
  loadSqlGroup: vi.fn(async (dir: string, name: string) => [{name, content: `INSERT INTO ${name} VALUES (1);`}]),
}));

vi.mock("fs/promises", async () => {
  const {vi} = await import("vitest");
  const fns = {readdir: vi.fn(), readFile: vi.fn()};
  return {default: fns, ...fns};
});

vi.mock("fs", async () => {
  const {vi} = await import("vitest");
  const fns = {existsSync: vi.fn()};
  return {default: fns, ...fns};
});

import fs from "fs/promises";
import {existsSync} from "fs";
import {loadSeeds, getSeedsSQL} from "../../../../src/modules/db/services/seed-generator";

describe("seed-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadSeeds()", () => {
    it("returns empty array when seeds dir missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(await loadSeeds()).toEqual([]);
    });

    it("falls back to singular seed/ directory", async () => {
      // First call checks "seeds" (not found), second checks "seed" (found)
      vi.mocked(existsSync)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "users.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue("INSERT INTO users VALUES (1);");
      const seeds = await loadSeeds();
      expect(seeds).toHaveLength(1);
    });

    it("reads from seeds directory", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "data.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue("INSERT INTO t VALUES (1);");
      const seeds = await loadSeeds();
      expect(seeds).toHaveLength(1);
      expect(seeds[0]!.content).toContain("INSERT");
    });
  });

  describe("getSeedsSQL()", () => {
    it("formats seeds with headers", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "data.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue("INSERT INTO t VALUES (1);");
      const sql = await getSeedsSQL();
      expect(sql).toContain("SEED DATA");
      expect(sql).toContain("INSERT INTO t");
    });

    it("returns placeholder when no seeds", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(await getSeedsSQL()).toBe("-- No seed files found");
    });
  });
});
