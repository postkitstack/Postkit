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
  getGeneratedSchemaPath: vi.fn(() => "/project/.postkit/db/schema.sql"),
}));

vi.mock("fs/promises", async () => {
  const {vi} = await import("vitest");
  const fns = {
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
  };
  return {default: fns, ...fns};
});

vi.mock("fs", async () => {
  const {vi} = await import("vitest");
  const fns = {existsSync: vi.fn()};
  return {default: fns, ...fns};
});

import fs from "fs/promises";
import {existsSync} from "fs";
import {generateSchemaSQLAndFingerprint, generateSchemaFingerprint, deleteGeneratedSchema} from "../../../../src/modules/db/services/schema-generator";

describe("schema-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateSchemaSQLAndFingerprint()", () => {
    it("orders sections correctly (enums before tables)", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, opts?: any) => {
        const dirStr = String(dir);
        // Top-level: discoverSchemaSections uses {withFileTypes: true}
        if (opts?.withFileTypes && dirStr === "/project/schema") return [
          {name: "tables", isFile: () => false, isDirectory: () => true},
          {name: "enums", isFile: () => false, isDirectory: () => true},
        ] as any;
        // Inner: loadSectionFiles uses readdir without opts, expects strings
        if (dirStr.includes("enums")) return ["status.sql"] as any;
        if (dirStr.includes("tables")) return ["users.sql"] as any;
        return [] as any;
      });
      vi.mocked(fs.stat).mockResolvedValue({isFile: () => false, isDirectory: () => true} as any);
      vi.mocked(fs.readFile).mockResolvedValue("SELECT 1;");
      vi.mocked(fs.writeFile).mockResolvedValue();
      const {schemaFile} = await generateSchemaSQLAndFingerprint();
      expect(schemaFile).toBe("/project/.postkit/db/schema.sql");
      const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      const enumIdx = written.indexOf("enums");
      const tableIdx = written.indexOf("tables");
      expect(enumIdx).toBeLessThan(tableIdx);
    });

    it("skips seed directories", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir: any, opts?: any) => {
        const dirStr = String(dir);
        if (opts?.withFileTypes && dirStr === "/project/schema") return [
          {name: "seeds", isFile: () => false, isDirectory: () => true},
          {name: "tables", isFile: () => false, isDirectory: () => true},
        ] as any;
        // Inner readdir for tables dir
        return ["a.sql"] as any;
      });
      vi.mocked(fs.stat).mockResolvedValue({isFile: () => false, isDirectory: () => true} as any);
      vi.mocked(fs.readFile).mockResolvedValue("SELECT 1;");
      vi.mocked(fs.writeFile).mockResolvedValue();
      await generateSchemaSQLAndFingerprint();
      const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
      expect(written).not.toContain("Section: seeds");
    });

    it("generates SHA-256 fingerprint", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue();
      const {fingerprint} = await generateSchemaSQLAndFingerprint();
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it("throws when schema directory not found", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(generateSchemaSQLAndFingerprint()).rejects.toThrow("Schema directory not found");
    });
  });

  describe("generateSchemaFingerprint()", () => {
    it("returns valid hex when no schema dir", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const fingerprint = await generateSchemaFingerprint();
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("deleteGeneratedSchema()", () => {
    it("removes file when it exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.unlink).mockResolvedValue();
      await deleteGeneratedSchema();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it("is no-op when file missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await deleteGeneratedSchema();
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });
});
