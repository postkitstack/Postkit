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

import {
  getCommittedState,
  saveCommittedState,
  addCommittedMigration,
  markMigrationDeployed,
  getPendingCommittedMigrations,
} from "../../../../src/modules/db/utils/committed";

const sampleMigration = {
  migrationFile: {name: "20240115_migration.sql", path: "/migrations/20240115_migration.sql", timestamp: "20240115"},
  description: "test migration",
  sessionMigrations: [],
  committedAt: "2024-01-15T10:00:00.000Z",
  deployed: false,
};

describe("committed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe("markMigrationDeployed()", () => {
    it("sets deployed and deployedAt", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({migrations: [sampleMigration]}));
      vi.mocked(fs.writeFile).mockResolvedValue();
      await markMigrationDeployed("20240115_migration.sql");
      const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
      expect(written.migrations[0].deployed).toBe(true);
      expect(written.migrations[0].deployedAt).toBeDefined();
    });
  });

  describe("getPendingCommittedMigrations()", () => {
    it("returns only undeployed migrations", async () => {
      const deployed = {...sampleMigration, deployed: true, deployedAt: "2024-01-15T12:00:00.000Z"};
      const undeployed = {...sampleMigration, migrationFile: {...sampleMigration.migrationFile, name: "undeployed.sql"}};
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({migrations: [deployed, undeployed]}));
      const pending = await getPendingCommittedMigrations();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.migrationFile.name).toBe("undeployed.sql");
    });
  });
});
