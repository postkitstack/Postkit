import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/common/shell", () => ({
  runSpawnCommand: vi.fn(),
  commandExists: vi.fn(),
}));

vi.mock("../../../../src/modules/db/utils/db-config", () => ({
  getDbConfig: vi.fn(() => ({
    localDbUrl: "postgres://localhost:5432/test",
    schemaPath: "/project/schema",
    schema: "public",
    dbmateBin: "dbmate",
    remotes: {},
    cliRoot: "/cli",
    projectRoot: "/project",
  })),
  getSessionMigrationsPath: vi.fn(() => "/project/.postkit/db/session"),
  getCommittedMigrationsPath: vi.fn(() => "/project/.postkit/db/migrations"),
}));

vi.mock("../../../../src/modules/db/utils/session", () => ({
  formatTimestamp: vi.fn(() => "20240115100000"),
}));

vi.mock("../../../../src/common/config", () => ({
  getPostkitDir: vi.fn(() => "/project/.postkit"),
}));

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
    rm: vi.fn(),
  },
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

import {runSpawnCommand} from "../../../../src/common/shell";
import fs from "fs/promises";
import {existsSync} from "fs";
import {
  createMigrationFile,
  runSessionMigrate,
  runCommittedMigrate,
  mergeSessionMigrations,
  listMigrations,
  deleteMigrationFile,
} from "../../../../src/modules/db/services/dbmate";

describe("dbmate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createMigrationFile()", () => {
    it("creates file with up/down sections", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFile).mockResolvedValue();
      const result = await createMigrationFile("Add user table", "CREATE TABLE users;");
      expect(result.name).toContain("add_user_table");
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const content = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      expect(content).toContain("-- migrate:up");
      expect(content).toContain("-- migrate:down");
      expect(content).toContain("CREATE TABLE users;");
    });

    it("sanitizes description in filename", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFile).mockResolvedValue();
      const result = await createMigrationFile("Add User Table!", "SELECT 1");
      expect(result.name).toContain("add_user_table_");
    });

    it("creates directory if missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();
      await createMigrationFile("test", "SELECT 1");
      expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), {recursive: true});
    });
  });

  describe("runSessionMigrate()", () => {
    it("returns success on exit code 0", async () => {
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "migrated", stderr: "", exitCode: 0});
      const result = await runSessionMigrate("postgres://localhost/db");
      expect(result.success).toBe(true);
    });

    it("returns failure on non-zero exit code", async () => {
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "", stderr: "error", exitCode: 1});
      const result = await runSessionMigrate("postgres://localhost/db");
      expect(result.success).toBe(false);
    });
  });

  describe("mergeSessionMigrations()", () => {
    it("merges session SQL files into one", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue(["001_first.sql", "002_second.sql"] as any);
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce("-- migrate:up\nCREATE TABLE a;\n-- migrate:down")
        .mockResolvedValueOnce("-- migrate:up\nCREATE TABLE b;\n-- migrate:down")
        .mockResolvedValueOnce("merged content");
      vi.mocked(fs.writeFile).mockResolvedValue();
      const result = await mergeSessionMigrations("/session", "combined");
      expect(result.name).toContain("combined");
      const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      expect(written).toContain("-- Source: 001_first.sql");
      expect(written).toContain("-- Source: 002_second.sql");
    });

    it("throws when session dir not found", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(mergeSessionMigrations("/session", "test")).rejects.toThrow("not found");
    });

    it("throws when no SQL files found", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue(["readme.md"] as any);
      await expect(mergeSessionMigrations("/session", "test")).rejects.toThrow("No session migrations found");
    });
  });

  describe("listMigrations()", () => {
    it("returns sorted migration files", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue(["20240102_second.sql", "20240101_first.sql"] as any);
      const migrations = await listMigrations();
      expect(migrations).toHaveLength(2);
      expect(migrations[0]!.name).toBe("20240101_first.sql");
    });

    it("returns empty array when dir does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const migrations = await listMigrations();
      expect(migrations).toEqual([]);
    });
  });

  describe("deleteMigrationFile()", () => {
    it("returns true and deletes when file exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.unlink).mockResolvedValue();
      expect(await deleteMigrationFile("/path/to/file.sql")).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(await deleteMigrationFile("/path/to/missing.sql")).toBe(false);
    });
  });
});
