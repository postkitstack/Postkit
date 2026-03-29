import path from "path";
import {cliRoot, projectRoot, loadPostkitConfig, getPostkitDir} from "../../../common/config";
import type {Config} from "../types/index";

export function getConfig(): Config {
  const config = loadPostkitConfig();

  const remoteDbUrl = config.db.remoteDbUrl;
  const localDbUrl = config.db.localDbUrl;

  if (!remoteDbUrl) {
    throw new Error(
      "db.remoteDbUrl is not set in postkit.config.json",
    );
  }

  if (!localDbUrl) {
    throw new Error(
      "db.localDbUrl is not set in postkit.config.json",
    );
  }

  const schemaPath = config.db.schemaPath
    ? path.resolve(projectRoot, config.db.schemaPath)
    : path.resolve(projectRoot, "schema");

  const migrationsPath = config.db.migrationsPath
    ? path.resolve(projectRoot, config.db.migrationsPath)
    : path.resolve(projectRoot, "migrations");

  return {
    remoteDbUrl,
    localDbUrl,
    schemaPath,
    migrationsPath,
    schema: config.db.schema || "public",
    pgSchemaBin: config.db.pgSchemaBin || "pgschema",
    dbmateBin: config.db.dbmateBin || "dbmate",
    cliRoot,
    projectRoot,
  };
}

export function getSessionFilePath(): string {
  return path.join(getPostkitDir(), "session.json");
}

export function getPlanFilePath(): string {
  return path.join(getPostkitDir(), "plan.sql");
}

export function getGeneratedSchemaPath(): string {
  return path.join(getPostkitDir(), "schema.sql");
}

export function getSessionMigrationsPath(): string {
  return path.join(getPostkitDir(), "migrations");
}
