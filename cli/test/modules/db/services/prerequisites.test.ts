import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/common/shell", () => ({
  commandExists: vi.fn(),
}));

vi.mock("../../../../src/modules/db/services/pgschema", () => ({
  checkPgschemaInstalled: vi.fn(),
}));

vi.mock("../../../../src/modules/db/services/dbmate", () => ({
  checkDbmateInstalled: vi.fn(),
}));

import {commandExists} from "../../../../src/common/shell";
import {checkPgschemaInstalled} from "../../../../src/modules/db/services/pgschema";
import {checkDbmateInstalled} from "../../../../src/modules/db/services/dbmate";
import {checkDbPrerequisites, checkPsqlInstalled} from "../../../../src/modules/db/services/prerequisites";

describe("prerequisites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPgschemaInstalled).mockResolvedValue(true);
    vi.mocked(checkDbmateInstalled).mockResolvedValue(true);
    vi.mocked(commandExists).mockResolvedValue(true);
  });

  describe("checkDbPrerequisites()", () => {
    it("passes when pgschema and dbmate are installed and psql isn't required", async () => {
      await expect(checkDbPrerequisites(false)).resolves.toBeUndefined();
      expect(commandExists).not.toHaveBeenCalled();
    });

    it("throws when pgschema is missing", async () => {
      vi.mocked(checkPgschemaInstalled).mockResolvedValue(false);
      await expect(checkDbPrerequisites(false)).rejects.toThrow("pgschema binary not found");
    });

    it("throws when dbmate is missing", async () => {
      vi.mocked(checkDbmateInstalled).mockResolvedValue(false);
      await expect(checkDbPrerequisites(false)).rejects.toThrow("dbmate binary not found");
    });

    it("does not check psql when requirePsql is not passed", async () => {
      await checkDbPrerequisites(false);
      expect(commandExists).not.toHaveBeenCalledWith("psql");
    });

    it("passes when requirePsql is true and psql is installed", async () => {
      await expect(checkDbPrerequisites(false, {requirePsql: true})).resolves.toBeUndefined();
      expect(commandExists).toHaveBeenCalledWith("psql");
    });

    it("throws a clear error when requirePsql is true and psql is missing", async () => {
      vi.mocked(commandExists).mockResolvedValue(false);
      await expect(checkDbPrerequisites(false, {requirePsql: true})).rejects.toThrow("psql binary not found");
    });
  });

  describe("checkPsqlInstalled()", () => {
    it("returns true when psql is on PATH", async () => {
      vi.mocked(commandExists).mockResolvedValue(true);
      expect(await checkPsqlInstalled()).toBe(true);
    });

    it("returns false when psql is not on PATH", async () => {
      vi.mocked(commandExists).mockResolvedValue(false);
      expect(await checkPsqlInstalled()).toBe(false);
    });
  });
});
