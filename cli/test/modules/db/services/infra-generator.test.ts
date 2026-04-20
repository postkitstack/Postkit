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

vi.mock("../../../../src/modules/db/services/database", () => ({
  parseConnectionUrl: vi.fn(() => ({
    host: "localhost", port: 5432, database: "test", user: "user", password: "pass",
  })),
}));

vi.mock("../../../../src/common/shell", () => ({
  runSpawnCommand: vi.fn(),
}));

vi.mock("fs/promises", async () => {
  const {vi} = await import("vitest");
  const fns = {readdir: vi.fn(), readFile: vi.fn(), writeFile: vi.fn()};
  return {default: fns, ...fns};
});

vi.mock("fs", async () => {
  const {vi} = await import("vitest");
  const fns = {existsSync: vi.fn()};
  return {default: fns, ...fns};
});

import fs from "fs/promises";
import {existsSync} from "fs";
import {loadInfra, getInfraSQL, applyInfra} from "../../../../src/modules/db/services/infra-generator";

describe("infra-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadInfra()", () => {
    it("returns empty array when infra dir missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(await loadInfra()).toEqual([]);
    });

    it("reads SQL files sorted by name", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "b.sql", isFile: () => true, isDirectory: () => false},
        {name: "a.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce("CREATE SCHEMA app;")
        .mockResolvedValueOnce("CREATE EXTENSION uuid_ossp;");
      const infra = await loadInfra();
      expect(infra).toHaveLength(2);
      expect(infra[0]!.name).toBe("a");
      expect(infra[1]!.name).toBe("b");
    });
  });

  describe("getInfraSQL()", () => {
    it("returns formatted SQL with headers", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "roles.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue("CREATE ROLE admin;");
      const sql = await getInfraSQL();
      expect(sql).toContain("INFRASTRUCTURE STATEMENTS");
      expect(sql).toContain("CREATE ROLE admin;");
    });

    it("returns placeholder when no infra", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(await getInfraSQL()).toBe("-- No infra files found");
    });
  });

  describe("applyInfra()", () => {
    it("calls psql with combined SQL", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        {name: "roles.sql", isFile: () => true, isDirectory: () => false},
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue("CREATE ROLE admin;");
      const {runSpawnCommand} = await import("../../../../src/common/shell");
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});
      await applyInfra("postgres://user:pass@host/db");
      expect(runSpawnCommand).toHaveBeenCalledTimes(1);
      const args = vi.mocked(runSpawnCommand).mock.calls[0]![0];
      expect(args[0]).toBe("psql");
    });
  });
});
