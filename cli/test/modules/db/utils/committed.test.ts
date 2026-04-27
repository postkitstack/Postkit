import {describe, it, expect, vi, beforeEach} from "vitest";
import fs from "fs/promises";
import {existsSync} from "fs";

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("../../../../src/modules/db/utils/db-config", () => ({
  getCommittedFilePath: vi.fn(() => "/project/.postkit/db/committed.json"),
}));

vi.mock("../../../../src/common/logger", () => ({
  logger: {warn: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn()},
}));

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockEnd = vi.fn();

vi.mock("pg", () => ({
  default: {
    Client: class {
      connect = mockConnect;
      query = mockQuery;
      end = mockEnd;
    },
  },
}));

import {
  getCommittedState,
  saveCommittedState,
  addCommittedMigration,
  getAllCommittedMigrations,
  getPendingCommittedMigrations,
} from "../../../../src/modules/db/utils/committed";

const sampleMigration = {
  migrationFile: {name: "20240115_migration.sql", path: "/migrations/20240115_migration.sql", timestamp: "20240115"},
  description: "test migration",
  sessionMigrations: [],
  committedAt: "2024-01-15T10:00:00.000Z",
};

const remoteUrl = "postgres://user:pass@localhost:5432/testdb";

describe("committed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockEnd.mockResolvedValue(undefined);
  });

  describe("getCommittedState()", () => {
    it("returns empty state when file missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const state = await getCommittedState();
      expect(state).toEqual({migrations: []});
    });

    it("returns parsed state when valid", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({migrations: [sampleMigration]}));
      const state = await getCommittedState();
      expect(state.migrations).toHaveLength(1);
      expect(state.migrations[0]!.description).toBe("test migration");
    });

    it("returns empty state for corrupted JSON", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("not json");
      const state = await getCommittedState();
      expect(state).toEqual({migrations: []});
    });
  });

  describe("saveCommittedState()", () => {
    it("writes JSON to disk", async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      await saveCommittedState({migrations: [sampleMigration]});
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/project/.postkit/db/committed.json",
        expect.any(String),
        "utf-8",
      );
      const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
      expect(written.migrations).toHaveLength(1);
    });
  });

  describe("addCommittedMigration()", () => {
    it("appends migration to existing state", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({migrations: [sampleMigration]}));
      vi.mocked(fs.writeFile).mockResolvedValue();
      const newMigration = {
        ...sampleMigration,
        migrationFile: {...sampleMigration.migrationFile, name: "20240116_new.sql"},
        description: "new migration",
      };
      await addCommittedMigration(newMigration);
      const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
      expect(written.migrations).toHaveLength(2);
    });
  });

  describe("getAllCommittedMigrations()", () => {
    it("returns all committed migrations from local state", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({migrations: [sampleMigration]}));
      const all = await getAllCommittedMigrations();
      expect(all).toHaveLength(1);
      expect(all[0]!.description).toBe("test migration");
    });
  });

  describe("getPendingCommittedMigrations()", () => {
    it("returns migrations not in remote schema_migrations", async () => {
      const migration1 = {
        ...sampleMigration,
        migrationFile: {...sampleMigration.migrationFile, timestamp: "20240115"},
      };
      const migration2 = {
        ...sampleMigration,
        migrationFile: {name: "20240116_other.sql", path: "/migrations/20240116_other.sql", timestamp: "20240116"},
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({migrations: [migration1, migration2]}));

      // Remote has 20240115 applied but not 20240116
      mockQuery
        .mockResolvedValueOnce({rows: [{result: 1}]}) // table check exists
        .mockResolvedValueOnce({rows: [{version: "20240115"}]}); // applied versions

      const pending = await getPendingCommittedMigrations(remoteUrl);
      expect(pending).toHaveLength(1);
      expect(pending[0]!.migrationFile.timestamp).toBe("20240116");
    });

    it("returns all migrations when schema_migrations table does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({migrations: [sampleMigration]}));

      // Table does not exist
      mockQuery.mockResolvedValueOnce({rows: []});

      const pending = await getPendingCommittedMigrations(remoteUrl);
      expect(pending).toHaveLength(1);
    });

    it("returns empty when no committed migrations exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const pending = await getPendingCommittedMigrations(remoteUrl);
      expect(pending).toHaveLength(0);
    });

    it("returns all migrations when remote connection fails", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({migrations: [sampleMigration]}));
      mockConnect.mockRejectedValueOnce(new Error("connection failed"));

      const pending = await getPendingCommittedMigrations(remoteUrl);
      expect(pending).toHaveLength(1);
    });
  });
});
