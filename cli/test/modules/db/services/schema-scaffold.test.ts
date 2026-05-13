import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("fs/promises", async () => {
  const {vi} = await import("vitest");
  const fns = {
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  };
  return {default: fns, ...fns};
});

vi.mock("fs", async () => {
  const {vi} = await import("vitest");
  const fns = {existsSync: vi.fn()};
  return {default: fns, ...fns};
});

vi.mock("../../../../src/common/config", () => ({
  getConfigFilePath: vi.fn(() => "/project/postkit.config.json"),
  invalidateConfig: vi.fn(),
}));

import * as fsp from "fs/promises";
import {existsSync} from "fs";
import {getConfigFilePath, invalidateConfig} from "../../../../src/common/config";
import {
  validateSchemaName,
  scaffoldSchemaDirectories,
  resolveInfraTargetFile,
  appendSchemaToInfraFile,
  addSchemaToConfig,
} from "../../../../src/modules/db/services/schema-scaffold";

describe("schema-scaffold", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-apply stable default for getConfigFilePath after reset
    vi.mocked(getConfigFilePath).mockReturnValue("/project/postkit.config.json");
  });

  // ============================================
  // validateSchemaName
  // ============================================

  describe("validateSchemaName()", () => {
    it('passes for "public"', () => {
      expect(() => validateSchemaName("public")).not.toThrow();
    });

    it('passes for "my_schema"', () => {
      expect(() => validateSchemaName("my_schema")).not.toThrow();
    });

    it('passes for "_private"', () => {
      expect(() => validateSchemaName("_private")).not.toThrow();
    });

    it('passes for "schema123"', () => {
      expect(() => validateSchemaName("schema123")).not.toThrow();
    });

    it('throws for uppercase "MySchema"', () => {
      expect(() => validateSchemaName("MySchema")).toThrow(/Invalid schema name/);
    });

    it('throws for leading digit "1schema"', () => {
      expect(() => validateSchemaName("1schema")).toThrow(/Invalid schema name/);
    });

    it('throws for hyphens "my-schema"', () => {
      expect(() => validateSchemaName("my-schema")).toThrow(/Invalid schema name/);
    });

    it('throws for spaces "my schema"', () => {
      expect(() => validateSchemaName("my schema")).toThrow(/Invalid schema name/);
    });
  });

  // ============================================
  // scaffoldSchemaDirectories
  // ============================================

  describe("scaffoldSchemaDirectories()", () => {
    const schemaPath = "/project/db/schema";
    const name = "analytics";

    it("creates schema root + 9 subdirs when dir does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fsp.mkdir).mockResolvedValue(undefined);

      const paths = await scaffoldSchemaDirectories(schemaPath, name, false, false);

      expect(paths).toHaveLength(10);
      expect(fsp.mkdir).toHaveBeenCalledTimes(10);
      // root dir is first
      expect(paths[0]).toBe(`${schemaPath}/${name}`);
    });

    it("throws with --force hint when dir exists and force is false", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await expect(scaffoldSchemaDirectories(schemaPath, name, false, false)).rejects.toThrow(
        /--force/,
      );
    });

    it("succeeds when dir exists and force is true — calls mkdir for all paths", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fsp.mkdir).mockResolvedValue(undefined);

      const paths = await scaffoldSchemaDirectories(schemaPath, name, true, false);

      expect(paths).toHaveLength(10);
      expect(fsp.mkdir).toHaveBeenCalledTimes(10);
    });

    it("dry-run: does NOT call mkdir but returns the expected 10-element path list", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const paths = await scaffoldSchemaDirectories(schemaPath, name, false, true);

      expect(paths).toHaveLength(10);
      expect(fsp.mkdir).not.toHaveBeenCalled();
    });

    it("return value always has root + tables/views/functions/triggers/types/enums/policies/grants/seeds", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fsp.mkdir).mockResolvedValue(undefined);

      const paths = await scaffoldSchemaDirectories(schemaPath, name, false, false);

      const expectedSubdirs = [
        "tables",
        "views",
        "functions",
        "triggers",
        "types",
        "enums",
        "policies",
        "grants",
        "seeds",
      ];
      const root = `${schemaPath}/${name}`;
      expect(paths[0]).toBe(root);
      for (const sub of expectedSubdirs) {
        expect(paths).toContain(`${root}/${sub}`);
      }
    });
  });

  // ============================================
  // resolveInfraTargetFile
  // ============================================

  describe("resolveInfraTargetFile()", () => {
    const infraPath = "/project/db/infra";

    it("returns first file containing CREATE SCHEMA (isNew: false)", async () => {
      vi.mocked(fsp.readdir).mockResolvedValue(["roles.sql", "schemas.sql"] as any);
      vi.mocked(fsp.readFile)
        .mockResolvedValueOnce("-- roles") // roles.sql — no CREATE SCHEMA
        .mockResolvedValueOnce("CREATE SCHEMA IF NOT EXISTS app;"); // schemas.sql — match

      const result = await resolveInfraTargetFile(infraPath);

      expect(result.isNew).toBe(false);
      expect(result.filePath).toBe(`${infraPath}/schemas.sql`); // actual file found, not fallback
    });

    it("falls back to file with 'schema' in basename when none contains CREATE SCHEMA (isNew: false)", async () => {
      vi.mocked(fsp.readdir).mockResolvedValue(["my_schema.sql", "roles.sql"] as any);
      vi.mocked(fsp.readFile)
        .mockResolvedValueOnce("-- no create schema here") // my_schema.sql — pass 1
        .mockResolvedValueOnce("-- roles"); // roles.sql — pass 1

      const result = await resolveInfraTargetFile(infraPath);

      expect(result.isNew).toBe(false);
      expect(result.filePath).toBe(`${infraPath}/my_schema.sql`);
    });

    it("falls back to schemas.sql (isNew: true) when no .sql files exist", async () => {
      vi.mocked(fsp.readdir).mockResolvedValue([] as any);

      const result = await resolveInfraTargetFile(infraPath);

      expect(result.isNew).toBe(true);
      expect(result.filePath).toBe(`${infraPath}/schemas.sql`);
    });

    it("falls back to schemas.sql (isNew: true) when readdir throws ENOENT", async () => {
      const err = Object.assign(new Error("ENOENT"), {code: "ENOENT"});
      vi.mocked(fsp.readdir).mockRejectedValue(err);

      const result = await resolveInfraTargetFile(infraPath);

      expect(result.isNew).toBe(true);
      expect(result.filePath).toBe(`${infraPath}/schemas.sql`);
    });

    it("rethrows non-ENOENT errors from readdir", async () => {
      const err = Object.assign(new Error("EPERM"), {code: "EPERM"});
      vi.mocked(fsp.readdir).mockRejectedValue(err);

      await expect(resolveInfraTargetFile(infraPath)).rejects.toThrow("EPERM");
    });
  });

  // ============================================
  // appendSchemaToInfraFile
  // ============================================

  describe("appendSchemaToInfraFile()", () => {
    const filePath = "/project/db/infra/schemas.sql";
    const name = "analytics";
    const stmt = `CREATE SCHEMA IF NOT EXISTS "${name}";`;

    it("dry-run: calls neither writeFile nor readFile", async () => {
      await appendSchemaToInfraFile(filePath, false, name, true);

      expect(fsp.writeFile).not.toHaveBeenCalled();
      expect(fsp.readFile).not.toHaveBeenCalled();
    });

    it("creates new file with just the stmt when isNew is true", async () => {
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined);

      await appendSchemaToInfraFile(filePath, true, name, false);

      expect(fsp.writeFile).toHaveBeenCalledWith(filePath, `${stmt}\n`, "utf-8");
    });

    it("creates new file when file does not exist (existsSync returns false)", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined);

      await appendSchemaToInfraFile(filePath, false, name, false);

      expect(fsp.writeFile).toHaveBeenCalledWith(filePath, `${stmt}\n`, "utf-8");
      expect(fsp.readFile).not.toHaveBeenCalled();
    });

    it("appends with newline separator when existing content does not end with newline", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fsp.readFile).mockResolvedValue("CREATE SCHEMA public;" as any);
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined);

      await appendSchemaToInfraFile(filePath, false, name, false);

      const written = vi.mocked(fsp.writeFile).mock.calls[0]![1] as string;
      expect(written).toBe(`CREATE SCHEMA public;\n${stmt}\n`);
    });

    it("appends without extra separator when existing content ends with newline", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fsp.readFile).mockResolvedValue("CREATE SCHEMA public;\n" as any);
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined);

      await appendSchemaToInfraFile(filePath, false, name, false);

      const written = vi.mocked(fsp.writeFile).mock.calls[0]![1] as string;
      expect(written).toBe(`CREATE SCHEMA public;\n${stmt}\n`);
    });

    it("does NOT write when stmt already present in file (idempotent)", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fsp.readFile).mockResolvedValue(
        `CREATE SCHEMA public;\n${stmt}\n` as any,
      );

      await appendSchemaToInfraFile(filePath, false, name, false);

      expect(fsp.writeFile).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // addSchemaToConfig
  // ============================================

  describe("addSchemaToConfig()", () => {
    const configPath = "/project/postkit.config.json";

    it("pushes name to existing db.schemas array and writes config", async () => {
      const config = {db: {schemaPath: "db/schema", schemas: ["public"]}};
      vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify(config) as any);
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined);

      await addSchemaToConfig("analytics", false);

      expect(fsp.writeFile).toHaveBeenCalledTimes(1);
      const written = JSON.parse((vi.mocked(fsp.writeFile).mock.calls[0]![1] as string).trim());
      expect(written.db.schemas).toContain("analytics");
      expect(written.db.schemas).toContain("public");
      expect(invalidateConfig).toHaveBeenCalled();
    });

    it("does NOT push and does NOT write when name already present (idempotent)", async () => {
      const config = {db: {schemas: ["public", "analytics"]}};
      vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify(config) as any);

      await addSchemaToConfig("analytics", false);

      expect(fsp.writeFile).not.toHaveBeenCalled();
      expect(invalidateConfig).not.toHaveBeenCalled();
    });

    it("creates db.schemas: [name] when schemas key was absent", async () => {
      const config = {db: {schemaPath: "db/schema"}};
      vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify(config) as any);
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined);

      await addSchemaToConfig("analytics", false);

      const written = JSON.parse((vi.mocked(fsp.writeFile).mock.calls[0]![1] as string).trim());
      expect(written.db.schemas).toEqual(["analytics"]);
    });

    it("creates db: {schemas: [name]} when db was absent in config", async () => {
      const config = {};
      vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify(config) as any);
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined);

      await addSchemaToConfig("analytics", false);

      const written = JSON.parse((vi.mocked(fsp.writeFile).mock.calls[0]![1] as string).trim());
      expect(written.db).toBeDefined();
      expect(written.db.schemas).toEqual(["analytics"]);
    });

    it("dry-run: skips both writeFile and invalidateConfig", async () => {
      const config = {db: {schemas: ["public"]}};
      vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify(config) as any);

      await addSchemaToConfig("analytics", true);

      expect(fsp.writeFile).not.toHaveBeenCalled();
      expect(invalidateConfig).not.toHaveBeenCalled();
    });

    it("throws a clear error when postkit.config.json contains invalid JSON", async () => {
      vi.mocked(fsp.readFile).mockResolvedValue("{ not valid json" as any);

      await expect(addSchemaToConfig("analytics", false)).rejects.toThrow(
        /postkit\.config\.json contains invalid JSON/,
      );
    });

    it("always calls invalidateConfig", async () => {
      const config = {db: {schemas: ["public"]}};
      vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify(config) as any);
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined);

      await addSchemaToConfig("newschema", false);

      expect(invalidateConfig).toHaveBeenCalledTimes(1);
    });
  });
});
