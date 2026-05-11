import {describe, it, expect, vi, beforeEach} from "vitest";
import path from "path";

const mockDbConfig = {
  localDbUrl: "postgres://localhost:5432/test",
  schemaPath: "/project/schema",
  schemas: ["public"],
  infraPath: "/project/db/infra",
  pgSchemaBin: "/cli/vendor/pgschema/pgschema-darwin-arm64",
  dbmateBin: "dbmate",
  remotes: {},
  cliRoot: "/cli",
  projectRoot: "/project",
};

vi.mock("../../../../src/common/shell", () => ({
  runCommand: vi.fn(),
  commandExists: vi.fn(),
}));

vi.mock("../../../../src/modules/db/utils/db-config", () => ({
  getDbConfig: vi.fn(() => mockDbConfig),
  getPlanFilePath: vi.fn((name: string) => `/project/.postkit/db/plan_${name}.sql`),
}));

vi.mock("../../../../src/modules/db/services/database", () => ({
  parseConnectionUrl: vi.fn(() => ({
    host: "localhost", port: 5432, database: "test", user: "user", password: "pass",
  })),
}));

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

import {runCommand, commandExists} from "../../../../src/common/shell";
import fs from "fs/promises";
import {existsSync} from "fs";
import {
  checkPgschemaInstalled,
  runPgschemaplan,
  wrapPlanSQL,
  runPgschemaDiff,
} from "../../../../src/modules/db/services/pgschema";

describe("pgschema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkPgschemaInstalled()", () => {
    it("returns true for bundled binary that exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      expect(await checkPgschemaInstalled()).toBe(true);
    });

    it("falls back to commandExists for relative path", async () => {
      const {getDbConfig} = await import("../../../../src/modules/db/utils/db-config");
      vi.mocked(getDbConfig).mockReturnValueOnce({...mockDbConfig, pgSchemaBin: "pgschema"});
      vi.mocked(commandExists).mockResolvedValue(true);
      expect(await checkPgschemaInstalled()).toBe(true);
    });
  });

  describe("runPgschemaplan()", () => {
    it("returns hasChanges:false for 'No changes'", async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: "No changes", stderr: "", exitCode: 0,
      });
      vi.mocked(existsSync).mockReturnValue(false);
      const result = await runPgschemaplan(
        "/schema.sql",
        "postgres://user:pass@host/db",
        "public",
        "/project/.postkit/db/plan_public.sql",
      );
      expect(result.hasChanges).toBe(false);
      expect(result.planOutput).toBe("No changes detected");
    });

    it("returns hasChanges:true when plan file has content", async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: "Changes found", stderr: "", exitCode: 0,
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("ALTER TABLE foo ADD COLUMN bar TEXT;");
      vi.mocked(fs.writeFile).mockResolvedValue();
      const result = await runPgschemaplan(
        "/schema.sql",
        "postgres://user:pass@host/db",
        "public",
        "/project/.postkit/db/plan_public.sql",
      );
      expect(result.hasChanges).toBe(true);
      expect(result.planFile).toBe("/project/.postkit/db/plan_public.sql");
    });

    it("strips CONCURRENTLY from plan SQL", async () => {
      vi.mocked(runCommand).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("CREATE INDEX CONCURRENTLY idx ON foo(col);");
      vi.mocked(fs.writeFile).mockResolvedValue();
      const result = await runPgschemaplan(
        "/schema.sql",
        "postgres://user:pass@host/db",
        "public",
        "/project/.postkit/db/plan_public.sql",
      );
      expect(result.planOutput).not.toContain("CONCURRENTLY");
      expect(result.planOutput).toContain("CREATE INDEX");
    });

    it("throws on non-zero exit without 'No changes'", async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: "", stderr: "fatal error", exitCode: 1,
      });
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(
        runPgschemaplan(
          "/schema.sql",
          "postgres://user:pass@host/db",
          "public",
          "/project/.postkit/db/plan_public.sql",
        ),
      ).rejects.toThrow("pgschema plan failed");
    });

    it("uses schemaName param in command args", async () => {
      const commandSpy = vi.mocked(runCommand).mockResolvedValue({
        stdout: "Changes found", stderr: "", exitCode: 0,
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("CREATE TABLE foo (id int);");
      vi.mocked(fs.writeFile).mockResolvedValue();
      await runPgschemaplan(
        "/schema.sql",
        "postgres://user:pass@host/db",
        "myapp",
        "/project/.postkit/db/plan_myapp.sql",
      );
      expect(commandSpy).toHaveBeenCalledTimes(1);
      const calledCommand = commandSpy.mock.calls[0]![0] as string;
      expect(calledCommand).toContain('--schema "myapp"');
      expect(calledCommand).not.toContain('--schema "public"');
    });
  });

  describe("wrapPlanSQL()", () => {
    it("prepends SET search_path", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("ALTER TABLE foo ADD bar TEXT;");
      const result = await wrapPlanSQL("/project/.postkit/db/plan_public.sql", "public");
      expect(result).toContain('SET search_path TO "public"');
      expect(result).toContain("ALTER TABLE");
    });

    it("returns empty string for empty plan", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("  ");
      const result = await wrapPlanSQL("/project/.postkit/db/plan_public.sql", "public");
      expect(result).toBe("");
    });
  });

  describe("runPgschemaDiff()", () => {
    it("returns diff output", async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: "--- a/table.sql\n+++ b/table.sql", stderr: "", exitCode: 0,
      });
      const result = await runPgschemaDiff("/schema.sql", "postgres://user:pass@host/db", "public");
      expect(result).toContain("table.sql");
    });
  });
});
