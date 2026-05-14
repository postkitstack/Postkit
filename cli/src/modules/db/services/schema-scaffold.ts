import path from "path";
import {existsSync} from "fs";
import {readdir, readFile, writeFile, mkdir} from "fs/promises";
import {getConfigFilePath, invalidateConfig} from "../../../common/config";

// ============================================
// Constants
// ============================================

const SCHEMA_SUBDIRS = [
  "tables",
  "views",
  "functions",
  "triggers",
  "types",
  "enums",
  "policies",
  "grants",
  "seeds",
] as const;

// ============================================
// Validation
// ============================================

/**
 * Validates that a schema name uses only lowercase letters, digits, and underscores,
 * and does not start with a digit.
 */
export function validateSchemaName(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid schema name "${name}". Use lowercase letters, digits, and underscores (e.g. "app", "analytics_v2").`,
    );
  }
}

// ============================================
// Directory Scaffolding
// ============================================

/**
 * Creates `<schemaPath>/<name>/` and all 9 standard subdirectories.
 * Returns an array of all created absolute paths (root dir + subdirs).
 *
 * In dry-run mode, the directories are not created but the expected paths are returned.
 * Throws if the schema directory already exists and force is false.
 */
export async function scaffoldSchemaDirectories(
  schemaPath: string,
  name: string,
  force: boolean,
  dryRun: boolean,
): Promise<string[]> {
  const schemaDir = path.join(schemaPath, name);

  if (existsSync(schemaDir) && !force) {
    throw new Error(
      `Schema directory "db/schema/${name}/" already exists. Use --force to re-scaffold.`,
    );
  }

  const allPaths: string[] = [
    schemaDir,
    ...SCHEMA_SUBDIRS.map((sub) => path.join(schemaDir, sub)),
  ];

  if (!dryRun) {
    for (const dirPath of allPaths) {
      await mkdir(dirPath, {recursive: true});
    }
  }

  return allPaths;
}

// ============================================
// Infra File Resolution
// ============================================

/**
 * Resolves the best infra SQL file to append the CREATE SCHEMA statement to.
 *
 * Priority:
 *  1. First sorted `.sql` file in infraPath whose content matches /CREATE\s+SCHEMA/i
 *  2. First sorted `.sql` file whose basename matches /schema/i
 *  3. Last resort: `<infraPath>/schemas.sql` (isNew: true)
 *
 * ENOENT on readdir is treated as last resort. Other errors bubble up.
 */
export async function resolveInfraTargetFile(
  infraPath: string,
): Promise<{filePath: string; isNew: boolean}> {
  let entries: string[];

  try {
    const raw = await readdir(infraPath);
    entries = raw
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {filePath: path.join(infraPath, "schemas.sql"), isNew: true};
    }
    throw err;
  }

  if (entries.length === 0) {
    return {filePath: path.join(infraPath, "schemas.sql"), isNew: true};
  }

  // Pass 1: find first file whose content contains CREATE SCHEMA
  for (const entry of entries) {
    const filePath = path.join(infraPath, entry);
    const content = await readFile(filePath, "utf-8");
    if (/CREATE\s+SCHEMA/i.test(content)) {
      return {filePath, isNew: false};
    }
  }

  // Pass 2: find first file whose basename matches /schema/i
  for (const entry of entries) {
    if (/schema/i.test(path.basename(entry, ".sql"))) {
      return {filePath: path.join(infraPath, entry), isNew: false};
    }
  }

  // Last resort: fresh project with no infra files yet
  return {filePath: path.join(infraPath, "schemas.sql"), isNew: true};
}

// ============================================
// Infra File Update
// ============================================

/**
 * Appends `CREATE SCHEMA IF NOT EXISTS "<name>";` to the resolved infra file.
 *
 * - If dryRun, returns without writing.
 * - If isNew OR file does not exist: writes a fresh file with just the statement.
 * - Otherwise reads the existing content; if the statement is already present, returns (idempotent).
 * - Appends with a leading newline separator when the existing content does not end with `\n`.
 *
 * SQL safety: name must already be validated by validateSchemaName() before calling this function.
 * The regex there restricts to [a-z_][a-z0-9_]*, which cannot contain `"` or escape sequences,
 * making the double-quoted identifier safe against injection.
 */
export async function appendSchemaToInfraFile(
  filePath: string,
  isNew: boolean,
  name: string,
  dryRun: boolean,
): Promise<void> {
  const stmt = `CREATE SCHEMA IF NOT EXISTS "${name}";`;

  if (dryRun) {
    return;
  }

  if (isNew || !existsSync(filePath)) {
    await writeFile(filePath, `${stmt}\n`, "utf-8");
    return;
  }

  const existing = await readFile(filePath, "utf-8");

  if (existing.includes(stmt)) {
    // Already present — idempotent
    return;
  }

  const sep = existing.endsWith("\n") ? "" : "\n";
  await writeFile(filePath, `${existing}${sep}${stmt}\n`, "utf-8");
}

// ============================================
// Config Update
// ============================================

/**
 * Adds the schema name to the `db.schemas` array in `postkit.config.json`.
 *
 * - Idempotent: does nothing if the name is already present.
 * - In dryRun mode, skips both the file write and invalidateConfig() — no side effects.
 */
export async function addSchemaToConfig(
  name: string,
  dryRun: boolean,
): Promise<void> {
  const configPath = getConfigFilePath();
  const raw = await readFile(configPath, "utf-8");

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `postkit.config.json contains invalid JSON: ${(e as Error).message}`,
    );
  }

  // Ensure config.db exists
  if (!config.db || typeof config.db !== "object" || Array.isArray(config.db)) {
    config.db = {};
  }

  const db = config.db as Record<string, unknown>;

  // Ensure config.db.schemas is an array
  if (!Array.isArray(db.schemas)) {
    db.schemas = [];
  }

  const schemas = db.schemas as string[];

  if (schemas.includes(name)) {
    return;
  }

  if (dryRun) {
    return;
  }

  schemas.push(name);
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  invalidateConfig();
}
