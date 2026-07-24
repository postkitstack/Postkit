import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock("../../../../src/common/config", () => ({
  projectRoot: "/project",
}));

vi.mock("../../../../src/modules/db/utils/db-config", () => ({
  getCommittedMigrationsPath: vi.fn(() => "/project/.postkit/db/migrations"),
  toRelativePath: vi.fn((p: string) => p.replace("/project/", "")),
}));

vi.mock("../../../../src/modules/db/utils/committed", () => ({
  getAllCommittedMigrations: vi.fn(),
  addCommittedMigration: vi.fn(),
}));

import fs from "fs";
import {scaffoldDbInfra, scaffoldStorageMigration} from "../../../../src/modules/db/services/scaffold";
import {getAllCommittedMigrations, addCommittedMigration} from "../../../../src/modules/db/utils/committed";

describe("scaffoldDbInfra()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates db/infra/ with recursive mkdir", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    scaffoldDbInfra();

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("db/infra"),
      {recursive: true},
    );
  });

  it("writes both 001_roles.sql and 002_schemas.sql when neither exists, returns true", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = scaffoldDbInfra();

    expect(result).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    const writtenPaths = vi.mocked(fs.writeFileSync).mock.calls.map((c) => c[0] as string);
    expect(writtenPaths.some((p) => p.endsWith("001_roles.sql"))).toBe(true);
    expect(writtenPaths.some((p) => p.endsWith("002_schemas.sql"))).toBe(true);
  });

  it("roles.sql content declares the expected PostgREST roles", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    scaffoldDbInfra();

    const rolesCall = vi.mocked(fs.writeFileSync).mock.calls.find((c) =>
      (c[0] as string).endsWith("001_roles.sql"),
    )!;
    const content = rolesCall[1] as string;
    for (const role of ["anon", "authenticated", "service_role", "app_user", "authenticator"]) {
      expect(content).toContain(`'${role}'`);
    }
  });

  it("schemas.sql content declares public, auth, and storage schemas", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    scaffoldDbInfra();

    const schemasCall = vi.mocked(fs.writeFileSync).mock.calls.find((c) =>
      (c[0] as string).endsWith("002_schemas.sql"),
    )!;
    const content = schemasCall[1] as string;
    expect(content).toContain("CREATE SCHEMA IF NOT EXISTS public;");
    expect(content).toContain("CREATE SCHEMA IF NOT EXISTS auth;");
    expect(content).toContain("CREATE SCHEMA IF NOT EXISTS storage;");
  });

  it("returns false and writes nothing when both files already exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = scaffoldDbInfra();

    expect(result).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("creates only the missing file when one already exists, returns true", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => (p as string).endsWith("001_roles.sql"));

    const result = scaffoldDbInfra();

    expect(result).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fs.writeFileSync).mock.calls[0]![0]).toContain("002_schemas.sql");
  });
});

describe("scaffoldStorageMigration()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAllCommittedMigrations).mockResolvedValue([]);
  });

  it("creates the committed migrations dir with recursive mkdir", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await scaffoldStorageMigration();

    expect(fs.mkdirSync).toHaveBeenCalledWith("/project/.postkit/db/migrations", {recursive: true});
  });

  it("skips writing and tracking when the migration file already exists, returns false", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = await scaffoldStorageMigration();

    expect(result).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(addCommittedMigration).not.toHaveBeenCalled();
  });

  it("writes the migration file with the storage.migrations SQL when missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await scaffoldStorageMigration();

    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    const [writtenPath, content] = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    expect(writtenPath).toContain("00000000000001_create_storage_migrations_table.sql");
    expect(content).toContain("-- migrate:up");
    expect(content).toContain("CREATE TABLE IF NOT EXISTS storage.migrations");
    expect(content).toContain("-- migrate:down");
    expect(content).toContain("DROP TABLE IF EXISTS storage.migrations;");
  });

  it("registers the migration in committed state with a fixed timestamp and empty sessionMigrations", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await scaffoldStorageMigration();

    expect(result).toBe(true);
    expect(addCommittedMigration).toHaveBeenCalledOnce();
    const registered = vi.mocked(addCommittedMigration).mock.calls[0]![0];
    expect(registered.migrationFile.name).toBe("00000000000001_create_storage_migrations_table.sql");
    expect(registered.migrationFile.timestamp).toBe("00000000000001");
    expect(registered.description).toBe("create storage.migrations table");
    expect(registered.sessionMigrations).toEqual([]);
    expect(typeof registered.committedAt).toBe("string");
    // Must not block `db start` on a brand-new project that hasn't deployed anything yet
    expect(registered.blocksSessionStart).toBe(false);
  });

  it("does not re-register when already tracked in committed.json, even though the file was missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(getAllCommittedMigrations).mockResolvedValue([
      {
        migrationFile: {
          name: "00000000000001_create_storage_migrations_table.sql",
          path: ".postkit/db/migrations/00000000000001_create_storage_migrations_table.sql",
          timestamp: "00000000000001",
        },
        description: "create storage.migrations table",
        sessionMigrations: [],
        committedAt: "2024-01-01T00:00:00.000Z",
      },
    ]);

    const result = await scaffoldStorageMigration();

    expect(result).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    expect(addCommittedMigration).not.toHaveBeenCalled();
  });
});
