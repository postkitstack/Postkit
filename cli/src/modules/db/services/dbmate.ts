import type {MigrationFile, ApplyResult} from "../types/index";
import {runCommand, commandExists} from "../../../common/shell";
import {getConfig} from "../utils/db-config";
import {getPostkitDir} from "../../../common/config";
import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";

export async function checkDbmateInstalled(): Promise<boolean> {
  const config = getConfig();

  // If resolved to an absolute path (npm-installed binary), check file existence
  if (path.isAbsolute(config.dbmateBin)) {
    return existsSync(config.dbmateBin);
  }

  // Otherwise check system PATH
  return commandExists(config.dbmateBin);
}

export async function createMigrationFile(
  description: string,
  upSql: string,
  downSql?: string,
  migrationsDir?: string,
): Promise<MigrationFile> {
  const config = getConfig();
  const targetDir = migrationsDir || config.migrationsPath;
  const timestamp = generateTimestamp();
  const safeName = description.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const fileName = `${timestamp}_${safeName}.sql`;
  const filePath = path.join(targetDir, fileName);

  // Ensure migrations directory exists
  if (!existsSync(targetDir)) {
    await fs.mkdir(targetDir, {recursive: true});
  }

  // Create migration file content
  let content = `-- migrate:up\n${upSql}\n`;

  if (downSql) {
    content += `\n-- migrate:down\n${downSql}\n`;
  } else {
    content += `\n-- migrate:down\n-- Add rollback SQL here if needed\n`;
  }

  await fs.writeFile(filePath, content, "utf-8");

  return {
    name: fileName,
    path: filePath,
    timestamp,
  };
}

export async function runDbmateMigrate(
  databaseUrl: string,
  migrationsDir?: string,
  migrationFilter?: string[],
): Promise<ApplyResult> {
  const config = getConfig();
  let targetDir = migrationsDir || config.migrationsPath;

  // If migration filter is provided, use filtered migrations
  if (migrationFilter && migrationFilter.length > 0) {
    targetDir = await filterMigrations(migrationFilter);
  }

  const command = `${config.dbmateBin} --env-file /dev/null --url "${databaseUrl}" --migrations-dir "${targetDir}" up`;
  const result = await runCommand(command);

  // Clean up filtered migrations if they were used
  if (migrationFilter && migrationFilter.length > 0) {
    await cleanupFilteredMigrations();
  }

  if (result.exitCode !== 0) {
    return {
      success: false,
      output: result.stderr || result.stdout,
    };
  }

  return {
    success: true,
    output: result.stdout,
  };
}

export async function copySessionMigrations(
  sessionMigrationsDir: string,
): Promise<{name: string; path: string}[]> {
  const config = getConfig();

  if (!existsSync(sessionMigrationsDir)) {
    return [];
  }

  // Ensure root migrations directory exists
  if (!existsSync(config.migrationsPath)) {
    await fs.mkdir(config.migrationsPath, {recursive: true});
  }

  const files = await fs.readdir(sessionMigrationsDir);
  const copied: {name: string; path: string}[] = [];

  for (const file of files) {
    if (file.endsWith(".sql")) {
      const src = path.join(sessionMigrationsDir, file);
      const dest = path.join(config.migrationsPath, file);
      await fs.copyFile(src, dest);
      copied.push({name: file, path: dest});
    }
  }

  return copied;
}

export async function deleteSessionMigrations(
  sessionMigrationsDir: string,
): Promise<void> {
  if (existsSync(sessionMigrationsDir)) {
    await fs.rm(sessionMigrationsDir, {recursive: true, force: true});
  }
}

export async function runDbmateStatus(databaseUrl: string): Promise<string> {
  const config = getConfig();

  const command = `${config.dbmateBin} --env-file /dev/null --url "${databaseUrl}" --migrations-dir "${config.migrationsPath}" status`;
  const result = await runCommand(command);

  return result.stdout || result.stderr;
}

export async function runDbmateRollback(
  databaseUrl: string,
): Promise<ApplyResult> {
  const config = getConfig();

  const command = `${config.dbmateBin} --env-file /dev/null --url "${databaseUrl}" --migrations-dir "${config.migrationsPath}" down`;
  const result = await runCommand(command);

  if (result.exitCode !== 0) {
    return {
      success: false,
      output: result.stderr || result.stdout,
    };
  }

  return {
    success: true,
    output: result.stdout,
  };
}

export async function listMigrations(): Promise<MigrationFile[]> {
  const config = getConfig();

  if (!existsSync(config.migrationsPath)) {
    return [];
  }

  const files = await fs.readdir(config.migrationsPath);
  const migrations: MigrationFile[] = [];

  for (const file of files) {
    if (file.endsWith(".sql")) {
      const match = file.match(/^(\d+)_/);
      if (match) {
        migrations.push({
          name: file,
          path: path.join(config.migrationsPath, file),
          timestamp: match[1],
        });
      }
    }
  }

  return migrations.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getLatestMigration(): Promise<MigrationFile | null> {
  const migrations = await listMigrations();
  return migrations.length > 0 ? migrations[migrations.length - 1] : null;
}

export async function deleteMigrationFile(filePath: string): Promise<boolean> {
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
    return true;
  }
  return false;
}

function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Extracts the -- migrate:up section content from a dbmate migration file
 */
function extractUpMigration(content: string): string {
  const lines = content.split("\n");
  const upLines: string[] = [];
  let inUpSection = false;
  let foundUp = false;

  for (const line of lines) {
    if (line.trim() === "-- migrate:up") {
      inUpSection = true;
      foundUp = true;
      continue;
    }
    if (line.trim() === "-- migrate:down") {
      break;
    }
    if (inUpSection && foundUp) {
      upLines.push(line);
    }
  }

  return upLines.join("\n").trim();
}

/**
 * Merges all session migrations into a single migration file
 */
export async function mergeSessionMigrations(
  sessionMigrationsDir: string,
  description: string,
): Promise<MigrationFile> {
  const config = getConfig();

  // Check if session migrations directory exists
  if (!existsSync(sessionMigrationsDir)) {
    throw new Error(`Session migrations directory not found: ${sessionMigrationsDir}`);
  }

  // Read all .sql files from session migrations directory
  const files = await fs.readdir(sessionMigrationsDir);
  const sqlFiles = files
    .filter(f => f.endsWith(".sql"))
    .sort(); // Sort alphabetically to ensure consistent ordering

  if (sqlFiles.length === 0) {
    throw new Error("No session migrations found to merge");
  }

  // Extract content from each session migration
  const sessionMigrations: Array<{name: string; content: string}> = [];

  for (const file of sqlFiles) {
    const filePath = path.join(sessionMigrationsDir, file);
    const content = await fs.readFile(filePath, "utf-8");
    const upContent = extractUpMigration(content);

    if (upContent) {
      sessionMigrations.push({
        name: file,
        content: upContent,
      });
    }
  }

  if (sessionMigrations.length === 0) {
    throw new Error("No migration content found in session files");
  }

  // Build the merged migration content
  const timestamp = generateTimestamp();
  const safeName = description.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const fileName = `${timestamp}_${safeName}.sql`;
  const committedAt = new Date().toISOString();

  const mergedContent = [
    "-- migrate:up",
    `-- Migration: ${description}`,
    `-- Merged from ${sessionMigrations.length} session migration(s)`,
    `-- Committed at: ${committedAt}`,
    "",
  ];

  // Add each session migration's content with source file comment
  for (const sessionMigration of sessionMigrations) {
    mergedContent.push(`-- Source: ${sessionMigration.name}`);
    mergedContent.push(sessionMigration.content);
    mergedContent.push("");
  }

  // Add the migrate:down section
  mergedContent.push("-- migrate:down");
  mergedContent.push("-- Add rollback SQL here if needed");

  // Write to the main migrations directory (not session directory)
  const targetDir = config.migrationsPath;

  // Ensure migrations directory exists
  if (!existsSync(targetDir)) {
    await fs.mkdir(targetDir, {recursive: true});
  }

  const filePath = path.join(targetDir, fileName);
  await fs.writeFile(filePath, mergedContent.join("\n"), "utf-8");

  return {
    name: fileName,
    path: filePath,
    timestamp,
  };
}

/**
 * Filters migrations to only include specified files
 * Creates a temporary directory with filtered migrations for dbmate to process
 */
export async function filterMigrations(
  migrationNames: string[],
): Promise<string> {
  const config = getConfig();
  const tempDir = path.join(getPostkitDir(), "temp-migrations");

  // Clean up temp directory if it exists
  if (existsSync(tempDir)) {
    await fs.rm(tempDir, {recursive: true, force: true});
  }

  // Create temp directory
  await fs.mkdir(tempDir, {recursive: true});

  // Copy only specified migrations to temp directory
  for (const name of migrationNames) {
    const srcPath = path.join(config.migrationsPath, name);
    if (existsSync(srcPath)) {
      const destPath = path.join(tempDir, name);
      await fs.copyFile(srcPath, destPath);
    }
  }

  return tempDir;
}

/**
 * Cleans up the temporary migrations directory
 */
export async function cleanupFilteredMigrations(): Promise<void> {
  const tempDir = path.join(getPostkitDir(), "temp-migrations");

  if (existsSync(tempDir)) {
    await fs.rm(tempDir, {recursive: true, force: true});
  }
}
