import path from "path";
import {cliRoot, projectRoot} from "../../../common/config.js";
import type {Config} from "../types/index.js";

export function getConfig(): Config {
  const remoteDbUrl = process.env.REMOTE_DATABASE_URL;
  const localDbUrl = process.env.LOCAL_DATABASE_URL;

  if (!remoteDbUrl) {
    throw new Error("REMOTE_DATABASE_URL is not set in environment");
  }

  if (!localDbUrl) {
    throw new Error("LOCAL_DATABASE_URL is not set in environment");
  }

  const schemaPath = process.env.SCHEMA_PATH
    ? path.resolve(cliRoot, process.env.SCHEMA_PATH)
    : path.resolve(projectRoot, "schema");

  const migrationsPath = process.env.MIGRATIONS_PATH
    ? path.resolve(cliRoot, process.env.MIGRATIONS_PATH)
    : path.resolve(projectRoot, "migrations");

  return {
    remoteDbUrl,
    localDbUrl,
    schemaPath,
    migrationsPath,
    pgSchemaBin: process.env.PGSCHEMA_BIN || "pgschema",
    dbmateBin: process.env.DBMATE_BIN || "dbmate",
    cliRoot,
    projectRoot,
  };
}

export function getSessionFilePath(): string {
  return path.join(cliRoot, ".session.json");
}

export function getPlanFilePath(): string {
  return path.join(cliRoot, ".plan.sql");
}

export function getGeneratedSchemaPath(): string {
  return path.join(cliRoot, ".schema.sql");
}
