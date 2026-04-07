import type {MigrationFile, ApplyResult} from "../types/index";
import {runSpawnCommand, commandExists} from "../../../common/shell";
import {getDbConfig} from "../utils/db-config";
import {getCommittedMigrationsPath, getSessionMigrationsPath} from "../utils/db-config";
import {formatTimestamp} from "../utils/session";
import {getPostkitDir} from "../../../common/config";
import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";

export async function checkDbmateInstalled(): Promise<boolean> {
  const config = getDbConfig();

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
  const targetDir = migrationsDir || getSessionMigrationsPath();
  const timestamp = formatTimestamp(new Date());
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

/**
 * Run dbmate migrate on session migrations directory.
 * Used during development to test migrations on local clone.
 */
export async function runSessionMigrate(
  databaseUrl: string,
): Promise<ApplyResult> {
  const config = getDbConfig();
  const sessionDir = getSessionMigrationsPath();

  // Args passed directly — no shell interpolation, no injection risk.
  const result = await runSpawnCommand([
    config.dbmateBin,
    "--env-file", "/dev/null",
    "--url", databaseUrl,
    "--migrations-dir", sessionDir,
    "up",
  ]);

  if (result.exitCode !== 0) {
    return {success: false, output: result.stderr || result.stdout};
  }

  return {success: true, output: result.stdout};
}

/**
 * Run dbmate migrate on committed migrations directory.
 * Used during deployment to apply committed migrations to target database.
 */
export async function runCommittedMigrate(
  databaseUrl: string,
  migrationFilter?: string[],
): Promise<ApplyResult> {
  const config = getDbConfig();
  let targetDir = getCommittedMigrationsPath();

  if (migrationFilter && migrationFilter.length > 0) {
    targetDir = await filterMigrations(migrationFilter);
  }

  // Args passed directly — no shell interpolation, no injection risk.
  const result = await runSpawnCommand([
    config.dbmateBin,
    "--env-file", "/dev/null",
    "--url", databaseUrl,
    "--migrations-dir", targetDir,
    "up",
  ]);

  if (migrationFilter && migrationFilter.length > 0) {
    await cleanupFilteredMigrations();
  }

  if (result.exitCode !== 0) {
    return {success: false, output: result.stderr || result.stdout};
  }

  return {success: true, output: result.stdout};
}

export async function deleteSessionMigrations(
  sessionMigrationsDir: string,
): Promise<void> {
  if (existsSync(sessionMigrationsDir)) {
    await fs.rm(sessionMigrationsDir, {recursive: true, force: true});
  }
}

export async function runDbmateStatus(databaseUrl: string): Promise<string> {
  const config = getDbConfig();

  const result = await runSpawnCommand([
    config.dbmateBin,
    "--env-file", "/dev/null",
    "--url", databaseUrl,
    "--migrations-dir", getCommittedMigrationsPath(),
    "status",
  ]);

  return result.stdout || result.stderr;
}

export async function listMigrations(): Promise<MigrationFile[]> {
  if (!existsSync(getCommittedMigrationsPath())) {
    return [];
  }

  const files = await fs.readdir(getCommittedMigrationsPath());
  const migrations: MigrationFile[] = [];

  for (const file of files) {
    if (file.endsWith(".sql")) {
      const match = file.match(/^(\d+)_/);
      if (match) {
        migrations.push({
          name: file,
          path: path.join(getCommittedMigrationsPath(), file),
          timestamp: match[1] ?? "",
        });
      }
    }
  }

  return migrations.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function deleteMigrationFile(filePath: string): Promise<boolean> {
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
    return true;
  }
  return false;
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
  const timestamp = formatTimestamp(new Date());
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
  const targetDir = getCommittedMigrationsPath();

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
async function filterMigrations(
  migrationNames: string[],
): Promise<string> {
  const tempDir = path.join(getPostkitDir(), "temp-migrations");

  // Clean up temp directory if it exists
  if (existsSync(tempDir)) {
    await fs.rm(tempDir, {recursive: true, force: true});
  }

  // Create temp directory
  await fs.mkdir(tempDir, {recursive: true});

  // Copy only specified migrations to temp directory
  for (const name of migrationNames) {
    const srcPath = path.join(getCommittedMigrationsPath(), name);
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
async function cleanupFilteredMigrations(): Promise<void> {
  const tempDir = path.join(getPostkitDir(), "temp-migrations");

  if (existsSync(tempDir)) {
    await fs.rm(tempDir, {recursive: true, force: true});
  }
}
