import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {fileURLToPath} from "url";
import type {TestProject} from "./test-project";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the predefined fixture schema (test/e2e/fixtures/schema/)
const FIXTURE_SCHEMA_DIR = path.resolve(__dirname, "..", "fixtures", "schema");

// ---------------------------------------------------------------------------
// Fixture schema — copy the entire predefined fixture into a test project
// ---------------------------------------------------------------------------

/**
 * Copy the entire predefined fixture schema into the test project's schema dir.
 * This mirrors the real test-proj/schema structure with:
 *   infra/, core/, tables/, rls/, grants/, seed/, trigger/, function/, view/
 *
 * Use this for workflow tests that need a realistic schema.
 */
export async function installFixtureSchema(project: TestProject): Promise<void> {
  await copyDirRecursive(FIXTURE_SCHEMA_DIR, project.schemaPath);
}

/**
 * Copy a subset of the fixture schema (only the named sections).
 * Sections: 'infra', 'core', 'tables', 'rls', 'grants', 'seed', 'trigger', 'function', 'view'
 */
export async function installFixtureSections(
  project: TestProject,
  sections: string[],
): Promise<void> {
  for (const section of sections) {
    const src = path.join(FIXTURE_SCHEMA_DIR, section);
    const dest = path.join(project.schemaPath, section);
    if (fsSync.existsSync(src)) {
      await copyDirRecursive(src, dest);
    }
  }
}

// ---------------------------------------------------------------------------
// Individual section writers — for tests that build schema incrementally
// ---------------------------------------------------------------------------

/**
 * Write a table DDL file into schema/tables/.
 */
export async function writeTableSchema(
  project: TestProject,
  fileName: string,
  ddl: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, "tables");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, ddl, "utf-8");
  return filePath;
}

/**
 * Write an infra SQL file into schema/infra/.
 */
export async function writeInfraFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, "infra");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a grant SQL file into schema/grants/ (or schema/grants/).
 */
export async function writeGrantFile(
  project: TestProject,
  fileName: string,
  sql: string,
  subdir = "grants",
): Promise<string> {
  const dir = path.join(project.schemaPath, subdir);
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a seed SQL file into schema/seeds/.
 */
export async function writeSeedFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, "seeds");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write an RLS SQL file into schema/rls/.
 */
export async function writeRlsFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, "rls");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a trigger SQL file into schema/trigger/.
 */
export async function writeTriggerFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, "trigger");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a function SQL file into schema/function/.
 */
export async function writeFunctionFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, "function");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a view SQL file into schema/view/.
 */
export async function writeViewFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, "view");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a core SQL file into schema/core/.
 */
export async function writeCoreFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, "core");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Fixture fixture table names — for test assertions
// ---------------------------------------------------------------------------

/** Tables created by the fixture schema */
export const FIXTURE_TABLES = ["category", "product"] as const;

/** Roles created by the fixture schema */
export const FIXTURE_ROLES = ["api_user", "readonly", "editor", "manager"] as const;

/** Seed category IDs from the fixture */
export const FIXTURE_SEED_CATEGORY_IDS = [
  "a0000000-0000-0000-0000-000000000001",
  "a0000000-0000-0000-0000-000000000002",
  "a0000000-0000-0000-0000-000000000003",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, {recursive: true});
  const entries = await fs.readdir(src, {withFileTypes: true});

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
