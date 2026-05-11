import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {fileURLToPath} from "url";
import type {TestProject} from "./test-project";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the predefined fixture infra dir (test/e2e/fixtures/infra/)
const FIXTURE_INFRA_DIR = path.resolve(__dirname, "..", "fixtures", "infra");

// Path to the predefined fixture schema dir (test/e2e/fixtures/schema/)
const FIXTURE_SCHEMA_DIR = path.resolve(__dirname, "..", "fixtures", "schema");

// ---------------------------------------------------------------------------
// Fixture schema — copy the entire predefined fixture into a test project
// ---------------------------------------------------------------------------

/**
 * Copy the public schema fixture + infra into the test project.
 * Copies:
 *   fixtures/infra/         → project.infraPath
 *   fixtures/schema/public/ → project.schemaPath/public/
 *
 * Use this for workflow tests that need a realistic single-schema setup.
 */
export async function installFixtureSchema(project: TestProject): Promise<void> {
  // Copy infra files
  if (fsSync.existsSync(FIXTURE_INFRA_DIR)) {
    await copyDirRecursive(FIXTURE_INFRA_DIR, project.infraPath);
  }
  // Copy public schema files
  const publicSrc = path.join(FIXTURE_SCHEMA_DIR, "public");
  if (fsSync.existsSync(publicSrc)) {
    await copyDirRecursive(publicSrc, path.join(project.schemaPath, "public"));
  }
}

/**
 * Copy all schema subdirs (public, app, etc.) + infra into the test project.
 * Use this for multi-schema workflow tests.
 */
export async function installMultiSchemaFixture(project: TestProject): Promise<void> {
  // Copy infra
  if (fsSync.existsSync(FIXTURE_INFRA_DIR)) {
    await copyDirRecursive(FIXTURE_INFRA_DIR, project.infraPath);
  }
  // Copy all schema subdirs (public, app, etc.)
  const entries = await fs.readdir(FIXTURE_SCHEMA_DIR, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await copyDirRecursive(
        path.join(FIXTURE_SCHEMA_DIR, entry.name),
        path.join(project.schemaPath, entry.name),
      );
    }
  }
}

/**
 * Copy a subset of the fixture schema (only the named sections) for a given schema name.
 * Sections: 'core', 'tables', 'rls', 'grants', 'seed', 'trigger', 'function', 'view'
 * Special: if sections includes 'infra', copies from FIXTURE_INFRA_DIR to project.infraPath.
 */
export async function installFixtureSections(
  project: TestProject,
  schemaName: string,
  sections: string[],
): Promise<void> {
  for (const section of sections) {
    if (section === "infra") {
      // infra lives at top-level fixtures/infra/, not inside a schema dir
      if (fsSync.existsSync(FIXTURE_INFRA_DIR)) {
        await copyDirRecursive(FIXTURE_INFRA_DIR, project.infraPath);
      }
    } else {
      const src = path.join(FIXTURE_SCHEMA_DIR, schemaName, section);
      const dest = path.join(project.schemaPath, schemaName, section);
      if (fsSync.existsSync(src)) {
        await copyDirRecursive(src, dest);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Individual section writers — for tests that build schema incrementally
// ---------------------------------------------------------------------------

/**
 * Write a table DDL file into schema/<schemaName>/tables/.
 */
export async function writeTableSchema(
  project: TestProject,
  schemaName: string,
  fileName: string,
  ddl: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, schemaName, "tables");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, ddl, "utf-8");
  return filePath;
}

/**
 * Write an infra SQL file into the project's infraPath (db/infra/).
 */
export async function writeInfraFile(
  project: TestProject,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = project.infraPath;
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a grant SQL file into schema/<schemaName>/grants/.
 */
export async function writeGrantFile(
  project: TestProject,
  schemaName: string,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, schemaName, "grants");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a seed SQL file into schema/<schemaName>/seed/.
 */
export async function writeSeedFile(
  project: TestProject,
  schemaName: string,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, schemaName, "seed");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write an RLS SQL file into schema/<schemaName>/rls/.
 */
export async function writeRlsFile(
  project: TestProject,
  schemaName: string,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, schemaName, "rls");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a trigger SQL file into schema/<schemaName>/trigger/.
 */
export async function writeTriggerFile(
  project: TestProject,
  schemaName: string,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, schemaName, "trigger");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a function SQL file into schema/<schemaName>/function/.
 */
export async function writeFunctionFile(
  project: TestProject,
  schemaName: string,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, schemaName, "function");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a view SQL file into schema/<schemaName>/view/.
 */
export async function writeViewFile(
  project: TestProject,
  schemaName: string,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, schemaName, "view");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

/**
 * Write a core SQL file into schema/<schemaName>/core/.
 */
export async function writeCoreFile(
  project: TestProject,
  schemaName: string,
  fileName: string,
  sql: string,
): Promise<string> {
  const dir = path.join(project.schemaPath, schemaName, "core");
  await fs.mkdir(dir, {recursive: true});
  const filePath = path.join(dir, `${fileName}.sql`);
  await fs.writeFile(filePath, sql, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Fixture table names — for test assertions
// ---------------------------------------------------------------------------

/** Tables created by the public fixture schema */
export const FIXTURE_TABLES = ["category", "product"] as const;

/** Tables created by the app fixture schema */
export const FIXTURE_APP_TABLES = ["order", "order_item"] as const;

/** Roles created by the fixture infra */
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
