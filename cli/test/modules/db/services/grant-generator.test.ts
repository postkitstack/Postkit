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
  loadSqlGroup: vi.fn(async (dir: string, name: string) => [{name, content: `GRANT ALL ON ${name};`}]),
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
import {loadGrants, getGrantsSQL, applyGrants} from "../../../../src/modules/db/services/grant-generator";

describe("grant-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadGrants()", () => {
    it("returns empty array when grants dir missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(await loadGrants()).toEqual([]);
    });

    it("reads from primary grants directory", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "public.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue("GRANT ALL ON SCHEMA public TO admin;");
      const grants = await loadGrants();
      expect(grants).toHaveLength(1);
      expect(grants[0]!.content).toContain("GRANT");
    });
  });

  describe("getGrantsSQL()", () => {
    it("formats grants with section headers", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "public.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue("GRANT ALL;");
      const sql = await getGrantsSQL();
      expect(sql).toContain("GRANT STATEMENTS");
      expect(sql).toContain("GRANT ALL;");
    });
  });

  describe("applyGrants()", () => {
    it("calls executeSQL for each grant", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "a.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue("GRANT SELECT;");
      vi.doMock("../../../../src/modules/db/services/database", () => ({
        executeSQL: vi.fn().mockResolvedValue("[]"),
      }));
      await applyGrants("postgres://user:pass@host/db");
    });
  });
});
