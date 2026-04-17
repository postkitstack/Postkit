import {describe, it, expect, vi, beforeEach} from "vitest";
import fs from "fs/promises";
import {existsSync} from "fs";

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("../../../../src/modules/db/utils/db-config", () => ({
  getSessionFilePath: vi.fn(() => "/project/.postkit/db/session.json"),
}));

import {
  getSession,
  createSession,
  updateSession,
  updatePendingChanges,
  deleteSession,
  hasActiveSession,
  formatTimestamp,
  formatSessionDuration,
} from "../../../../src/modules/db/utils/session";

const validSession = {
  active: true,
  startedAt: "2024-01-15T10:00:00.000Z",
  clonedAt: "20240115100000",
  remoteName: "dev",
  localDbUrl: "postgres://localhost:5432/local",
  remoteDbUrl: "postgres://dev:5432/remote",
  pendingChanges: {
    planned: false,
    applied: false,
    planFile: null,
    migrationFiles: [],
    description: null,
    schemaFingerprint: null,
    migrationApplied: false,
    grantsApplied: false,
    seedsApplied: false,
  },
};

describe("session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSession()", () => {
    it("returns null when file missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(await getSession()).toBeNull();
    });

    it("returns parsed session state", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validSession));
      const session = await getSession();
      expect(session).not.toBeNull();
      expect(session!.active).toBe(true);
      expect(session!.remoteName).toBe("dev");
    });

    it("returns null for invalid JSON", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("not json");
      expect(await getSession()).toBeNull();
    });

    it("returns null for missing required fields", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({active: true}));
      expect(await getSession()).toBeNull();
    });
  });

  describe("createSession()", () => {
    it("writes session with correct structure", async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      const session = await createSession(
        "postgres://remote:5432/db",
        "postgres://localhost:5432/local",
        "dev",
      );
      expect(session.active).toBe(true);
      expect(session.remoteName).toBe("dev");
      expect(session.pendingChanges.planned).toBe(false);
      expect(session.pendingChanges.applied).toBe(false);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
    });

    it("sets clonedAt in YYYYMMDDHHmmss format", async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      const session = await createSession("postgres://remote/db", "postgres://local/db");
      expect(session.clonedAt).toMatch(/^\d{14}$/);
    });
  });

  describe("updateSession()", () => {
    it("merges updates into existing session", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validSession));
      vi.mocked(fs.writeFile).mockResolvedValue();
      const updated = await updateSession({active: false});
      expect(updated.active).toBe(false);
      expect(updated.remoteName).toBe("dev");
    });

    it("throws when no session exists", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(updateSession({active: false})).rejects.toThrow("No active session found");
    });
  });

  describe("updatePendingChanges()", () => {
    it("merges partial pending changes", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validSession));
      vi.mocked(fs.writeFile).mockResolvedValue();
      const updated = await updatePendingChanges({planned: true});
      expect(updated.pendingChanges.planned).toBe(true);
      expect(updated.pendingChanges.applied).toBe(false);
    });

    it("throws when no session exists", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(updatePendingChanges({planned: true})).rejects.toThrow("No active session found");
    });
  });

  describe("deleteSession()", () => {
    it("removes session file", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.unlink).mockResolvedValue();
      await deleteSession();
      expect(fs.unlink).toHaveBeenCalledWith("/project/.postkit/db/session.json");
    });

    it("is no-op when file does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await deleteSession();
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe("hasActiveSession()", () => {
    it("returns true for active session", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validSession));
      expect(await hasActiveSession()).toBe(true);
    });

    it("returns false when no session", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(await hasActiveSession()).toBe(false);
    });
  });

  describe("formatTimestamp()", () => {
    it("formats date as YYYYMMDDHHmmss", () => {
      const date = new Date(2024, 0, 15, 10, 30, 45);
      expect(formatTimestamp(date)).toBe("20240115103045");
    });
  });

  describe("formatSessionDuration()", () => {
    it("returns hours and minutes for durations >= 1 hour", () => {
      const startedAt = new Date(Date.now() - 90 * 60 * 1000).toISOString();
      const result = formatSessionDuration(startedAt);
      expect(result).toMatch(/^\d+h \d+m$/);
    });

    it("returns minutes only for durations < 1 hour", () => {
      const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const result = formatSessionDuration(startedAt);
      expect(result).toMatch(/^\d+m$/);
      expect(result).not.toContain("h");
    });
  });
});
