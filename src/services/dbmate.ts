import type { MigrationFile, ApplyResult } from '../types/index.js';
import { runCommand, commandExists } from '../utils/shell.js';
import { getConfig } from '../utils/config.js';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export async function checkDbmateInstalled(): Promise<boolean> {
  const config = getConfig();
  return commandExists(config.dbmateBin);
}

export async function createMigrationFile(
  description: string,
  upSql: string,
  downSql?: string
): Promise<MigrationFile> {
  const config = getConfig();
  const timestamp = generateTimestamp();
  const safeName = description.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `${timestamp}_${safeName}.sql`;
  const filePath = path.join(config.migrationsPath, fileName);

  // Ensure migrations directory exists
  if (!existsSync(config.migrationsPath)) {
    await fs.mkdir(config.migrationsPath, { recursive: true });
  }

  // Create migration file content
  let content = `-- migrate:up\n${upSql}\n`;

  if (downSql) {
    content += `\n-- migrate:down\n${downSql}\n`;
  } else {
    content += `\n-- migrate:down\n-- Add rollback SQL here if needed\n`;
  }

  await fs.writeFile(filePath, content, 'utf-8');

  return {
    name: fileName,
    path: filePath,
    timestamp,
  };
}

export async function runDbmateMigrate(databaseUrl: string): Promise<ApplyResult> {
  const config = getConfig();

  const command = `${config.dbmateBin} --url "${databaseUrl}" --migrations-dir "${config.migrationsPath}" up`;
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

export async function runDbmateStatus(databaseUrl: string): Promise<string> {
  const config = getConfig();

  const command = `${config.dbmateBin} --url "${databaseUrl}" --migrations-dir "${config.migrationsPath}" status`;
  const result = await runCommand(command);

  return result.stdout || result.stderr;
}

export async function runDbmateRollback(databaseUrl: string): Promise<ApplyResult> {
  const config = getConfig();

  const command = `${config.dbmateBin} --url "${databaseUrl}" --migrations-dir "${config.migrationsPath}" down`;
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
    if (file.endsWith('.sql')) {
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

function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}
