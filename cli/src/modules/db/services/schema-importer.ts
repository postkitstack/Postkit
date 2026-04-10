import pg from "pg";
import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import {runCommand} from "../../../common/shell";
import {getDbConfig, getTmpImportDir} from "../utils/db-config";
import {parseConnectionUrl, createDatabase, dropDatabase} from "./database";
import {runPgschemaplan} from "./pgschema";
import {generateSchemaSQLAndFingerprint} from "./schema-generator";

const {Client} = pg;

/**
 * Run pgschema dump --multi-file to dump a database schema into a temp directory.
 */
export async function runPgschemaDump(
  databaseUrl: string,
  schemaName: string,
  outputDir: string,
): Promise<{dumpDir: string; files: string[]}> {
  const config = getDbConfig();
  const dbInfo = parseConnectionUrl(databaseUrl);
  const schemaFile = path.join(outputDir, "schema.sql");

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    await fs.mkdir(outputDir, {recursive: true});
  }

  // Run pgschema dump with multi-file output
  const command = [
    config.pgSchemaBin,
    "dump",
    "--host", dbInfo.host,
    "--port", String(dbInfo.port),
    "--db", dbInfo.database,
    "--user", dbInfo.user,
    "--schema", schemaName,
    "--multi-file",
    "--file", schemaFile,
  ].join(" ");

  const result = await runCommand(command, {
    env: {PGPASSWORD: dbInfo.password},
  });

  if (result.exitCode !== 0) {
    throw new Error(`pgschema dump failed: ${result.stderr || result.stdout}`);
  }

  // List all produced files
  const files = await listFilesRecursive(outputDir);

  return {dumpDir: outputDir, files};
}

/**
 * Parse schema.sql to extract infrastructure statements (roles, schemas, extensions).
 */
export function extractInfraStatements(
  schemaSQL: string,
): {roles: string[]; schemas: string[]; extensions: string[]; remainder: string} {
  const roles: string[] = [];
  const schemas: string[] = [];
  const extensions: string[] = [];
  const remainderLines: string[] = [];

  // Split into individual statements (separated by semicolons at end of line)
  // Use a simple line-by-line approach to extract CREATE ROLE/SCHEMA/EXTENSION
  const lines = schemaSQL.split("\n");
  let currentStatement: string[] = [];
  let statementType: "role" | "schema" | "extension" | "other" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect start of a new statement
    if (/^CREATE\s+(?:OR\s+REPLACE\s+)?ROLE\s/i.test(trimmed) ||
        /^CREATE\s+USER\s/i.test(trimmed)) {
      // Flush previous statement
      if (currentStatement.length > 0) {
        flushStatement(currentStatement, statementType, roles, schemas, extensions, remainderLines);
      }
      currentStatement = [line];
      statementType = "role";
    } else if (/^CREATE\s+SCHEMA\s/i.test(trimmed)) {
      if (currentStatement.length > 0) {
        flushStatement(currentStatement, statementType, roles, schemas, extensions, remainderLines);
      }
      currentStatement = [line];
      statementType = "schema";
    } else if (/^CREATE\s+EXTENSION\s/i.test(trimmed)) {
      if (currentStatement.length > 0) {
        flushStatement(currentStatement, statementType, roles, schemas, extensions, remainderLines);
      }
      currentStatement = [line];
      statementType = "extension";
    } else if (currentStatement.length > 0) {
      currentStatement.push(line);
      // Statement ends with semicolon
      if (trimmed.endsWith(";")) {
        flushStatement(currentStatement, statementType, roles, schemas, extensions, remainderLines);
        currentStatement = [];
        statementType = null;
      }
    } else {
      remainderLines.push(line);
    }
  }

  // Flush any remaining statement
  if (currentStatement.length > 0) {
    flushStatement(currentStatement, statementType, roles, schemas, extensions, remainderLines);
  }

  return {
    roles,
    schemas,
    extensions,
    remainder: remainderLines.join("\n").trim(),
  };
}

function flushStatement(
  statement: string[],
  type: "role" | "schema" | "extension" | "other" | null,
  roles: string[],
  schemas: string[],
  extensions: string[],
  remainder: string[],
): void {
  const sql = statement.join("\n").trim();
  if (!sql) return;

  switch (type) {
    case "role":
      roles.push(sql);
      break;
    case "schema":
      schemas.push(sql);
      break;
    case "extension":
      extensions.push(sql);
      break;
    default:
      remainder.push(sql);
      break;
  }
}

/**
 * Normalize a pgschema multi-file dump into PostKit's schema directory structure.
 */
export async function normalizeDumpForPostkit(
  dumpDir: string,
  schemaPath: string,
  schemaName: string,
): Promise<{filesCreated: string[]}> {
  const filesCreated: string[] = [];

  // Map of pgschema dump directories to PostKit schema subdirectories
  const dirMapping: Record<string, string> = {
    tables: "tables",
    functions: "functions",
    extensions: "extensions",
    types: "types",
    enums: "enums",
    domains: "domains",
    sequences: "sequences",
    views: "views",
    triggers: "triggers",
    indexes: "indexes",
    constraints: "constraints",
    policies: "policies",
  };

  // Move pgschema-compatible directories
  for (const [sourceDir, targetDir] of Object.entries(dirMapping)) {
    const sourcePath = path.join(dumpDir, sourceDir);
    if (existsSync(sourcePath)) {
      const targetPath = path.join(schemaPath, targetDir);
      await fs.mkdir(targetPath, {recursive: true});

      // Copy all SQL files from source to target
      const entries = await fs.readdir(sourcePath);
      for (const entry of entries) {
        if (entry.endsWith(".sql")) {
          const srcFile = path.join(sourcePath, entry);
          const destFile = path.join(targetPath, entry);
          await fs.copyFile(srcFile, destFile);
          filesCreated.push(path.relative(schemaPath, destFile));
        }
      }
    }
  }

  // Parse schema.sql for infrastructure statements
  const schemaSQLPath = path.join(dumpDir, "schema.sql");
  if (existsSync(schemaSQLPath)) {
    const schemaSQL = await fs.readFile(schemaSQLPath, "utf-8");
    const {roles, schemas, extensions, remainder} = extractInfraStatements(schemaSQL);

    // Write infra files
    const infraDir = path.join(schemaPath, "infra");
    await fs.mkdir(infraDir, {recursive: true});

    if (roles.length > 0) {
      const rolesPath = path.join(infraDir, "roles.sql");
      await fs.writeFile(rolesPath, roles.join("\n\n") + "\n", "utf-8");
      filesCreated.push("infra/roles.sql");
    }

    if (schemas.length > 0) {
      const schemasPath = path.join(infraDir, "schemas.sql");
      await fs.writeFile(schemasPath, schemas.join("\n\n") + "\n", "utf-8");
      filesCreated.push("infra/schemas.sql");
    }

    // If extensions weren't in a directory but in schema.sql, write them
    if (extensions.length > 0) {
      const extDir = path.join(schemaPath, "extensions");
      await fs.mkdir(extDir, {recursive: true});
      const extPath = path.join(extDir, "imported_extensions.sql");
      await fs.writeFile(extPath, extensions.join("\n\n") + "\n", "utf-8");
      filesCreated.push("extensions/imported_extensions.sql");
    }
  }

  // Consolidate privileges into grants directory
  const grantsDir = path.join(schemaPath, "grants");
  const privilegeDirs = ["privileges", "default_privileges"];
  const grantStatements: string[] = [];

  for (const privDir of privilegeDirs) {
    const privPath = path.join(dumpDir, privDir);
    if (existsSync(privPath)) {
      const entries = await fs.readdir(privPath);
      for (const entry of entries) {
        if (entry.endsWith(".sql")) {
          const content = await fs.readFile(path.join(privPath, entry), "utf-8");
          grantStatements.push(content.trim());
        }
      }
    }
  }

  if (grantStatements.length > 0) {
    await fs.mkdir(grantsDir, {recursive: true});
    const grantsPath = path.join(grantsDir, `${schemaName}.sql`);
    await fs.writeFile(grantsPath, grantStatements.join("\n\n") + "\n", "utf-8");
    filesCreated.push(`grants/${schemaName}.sql`);
  }

  // Ensure .pgschemaignore exists
  const ignorePath = path.join(schemaPath, ".pgschemaignore");
  if (!existsSync(ignorePath)) {
    const content = [
      "[tables]",
      'patterns = ["schema_migrations"]',
      "",
    ].join("\n");
    await fs.writeFile(ignorePath, content, "utf-8");
  }

  return {filesCreated};
}

/**
 * Generate baseline DDL by running pgschema plan against an empty temporary database.
 *
 * 1. Creates an empty temp database
 * 2. Generates schema.sql from the normalized files
 * 3. Runs pgschema plan (schema files vs empty DB = full CREATE DDL)
 * 4. Drops the temp database
 * 5. Returns the DDL string
 */
export async function generateBaselineDDL(
  schemaPath: string,
  schemaName: string,
): Promise<string> {
  const config = getDbConfig();

  // Construct a temp database URL based on localDbUrl
  const localInfo = parseConnectionUrl(config.localDbUrl);
  const tmpDbName = `postkit_import_${Date.now()}`;
  const tmpDbUrl = `postgres://${localInfo.user}:${encodeURIComponent(localInfo.password)}@${localInfo.host}:${localInfo.port}/${tmpDbName}`;

  try {
    // Create empty temp database
    await createDatabase(tmpDbUrl);

    // Generate schema.sql from the normalized schema files
    const {schemaFile} = await generateSchemaSQLAndFingerprint();

    // Run pgschema plan against empty database — produces full CREATE DDL
    const planResult = await runPgschemaplan(schemaFile, tmpDbUrl);

    if (!planResult.hasChanges || !planResult.planOutput) {
      throw new Error(
        "pgschema plan produced no output. The schema directory may be empty or the dump normalization may have failed.",
      );
    }

    return planResult.planOutput;
  } finally {
    // Always clean up the temp database
    try {
      await dropDatabase(tmpDbUrl);
    } catch {
      // Best-effort cleanup — don't fail if temp DB can't be dropped
    }
  }
}

/**
 * Insert a migration tracking record into the source database's schema_migrations table.
 */
export async function syncMigrationState(
  databaseUrl: string,
  version: string,
): Promise<void> {
  const client = new Client({connectionString: databaseUrl});

  try {
    await client.connect();

    // Create schema_migrations table if it doesn't exist (dbmate format)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(128) NOT NULL PRIMARY KEY
      )
    `);

    // Insert the baseline version
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [version],
    );
  } finally {
    await client.end();
  }
}

/**
 * Recursively list all files in a directory, returning relative paths.
 */
async function listFilesRecursive(dir: string): Promise<string[]> {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = await fs.readdir(dir, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}
