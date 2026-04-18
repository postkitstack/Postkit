import fs from "fs/promises";
import path from "path";
import type {TestProject} from "./test-project";

/**
 * Write a table DDL file into the schema/tables/ directory.
 */
export async function writeTableSchema(
  project: TestProject,
  fileName: string,
  ddl: string,
): Promise<string> {
  const tablesDir = path.join(project.schemaPath, "tables");
  await fs.mkdir(tablesDir, {recursive: true});
  const filePath = path.join(tablesDir, `${fileName}.sql`);
  await fs.writeFile(filePath, ddl, "utf-8");
  return filePath;
}

/**
 * Write an infra SQL file into the schema/infra/ directory.
 */
export async function writeInfraFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const infraDir = path.join(project.schemaPath, "infra");
  await fs.mkdir(infraDir, {recursive: true});
  const filePath = path.join(infraDir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a grant SQL file into the schema/grants/ directory.
 */
export async function writeGrantFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const grantsDir = path.join(project.schemaPath, "grants");
  await fs.mkdir(grantsDir, {recursive: true});
  const filePath = path.join(grantsDir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a seed SQL file into the schema/seeds/ directory.
 */
export async function writeSeedFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const seedsDir = path.join(project.schemaPath, "seeds");
  await fs.mkdir(seedsDir, {recursive: true});
  const filePath = path.join(seedsDir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

// Common DDL templates for tests

export const SIMPLE_TABLE_DDL = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

export const SECOND_TABLE_DDL = `
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

export const SIMPLE_INFRA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
`;

export const SIMPLE_GRANT_SQL = `
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO postkit;
`;

export const SIMPLE_SEED_SQL = `
INSERT INTO users (name, email) VALUES ('Test User', 'test@example.com');
`;
