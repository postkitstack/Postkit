import {describe, it, expect, vi} from "vitest";

vi.mock("../../../../src/common/config", () => ({
  getPostkitDir: vi.fn(() => "/project/.postkit"),
  cliRoot: "/cli",
  projectRoot: "/project",
}));

import {
  getPostkitDbDir,
  getSessionFilePath,
  getPlanFilePath,
  getGeneratedSchemaPath,
  getSessionMigrationsPath,
  getCommittedMigrationsPath,
  getCommittedFilePath,
  getTmpImportDir,
} from "../../../../src/modules/db/utils/db-config";

describe("db-config path helpers", () => {
  it("getPostkitDbDir() returns .postkit/db", () => {
    expect(getPostkitDbDir()).toBe("/project/.postkit/db");
  });

  it("getSessionFilePath() returns session.json path", () => {
    expect(getSessionFilePath()).toBe("/project/.postkit/db/session.json");
  });

  it("getPlanFilePath(schemaName) returns plan_<name>.sql path", () => {
    expect(getPlanFilePath("public")).toBe("/project/.postkit/db/plan_public.sql");
  });

  it("getGeneratedSchemaPath(schemaName) returns schema_<name>.sql path", () => {
    expect(getGeneratedSchemaPath("public")).toBe("/project/.postkit/db/schema_public.sql");
  });

  it("getSessionMigrationsPath() returns session dir", () => {
    expect(getSessionMigrationsPath()).toBe("/project/.postkit/db/session");
  });

  it("getCommittedMigrationsPath() returns migrations dir", () => {
    expect(getCommittedMigrationsPath()).toBe("/project/.postkit/db/migrations");
  });

  it("getCommittedFilePath() returns committed.json path", () => {
    expect(getCommittedFilePath()).toBe("/project/.postkit/db/committed.json");
  });

  it("getTmpImportDir() returns tmp-import dir", () => {
    expect(getTmpImportDir()).toBe("/project/.postkit/db/tmp-import");
  });
});
