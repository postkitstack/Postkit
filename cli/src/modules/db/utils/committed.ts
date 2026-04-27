import fs from "fs/promises";
import {existsSync} from "fs";
import pg from "pg";
import type {CommittedState, CommittedMigration} from "../types/index";
import {getCommittedFilePath} from "./db-config";
import {logger} from "../../../common/logger";

const {Client} = pg;

/**
 * Reads the committed state from .postkit/committed.json
 */
export async function getCommittedState(): Promise<CommittedState> {
  const committedFilePath = getCommittedFilePath();

  if (!existsSync(committedFilePath)) {
    return {migrations: []};
  }

  try {
    const content = await fs.readFile(committedFilePath, "utf-8");
    const state = JSON.parse(content) as CommittedState;
    return {migrations: state.migrations ?? []};
  } catch (error) {
    logger.warn(
      `committed.json is corrupted and could not be parsed — treating as empty. ` +
      `(${error instanceof Error ? error.message : String(error)})\n` +
      `  File: ${getCommittedFilePath()}`,
    );
    return {migrations: []};
  }
}

/**
 * Saves the committed state to .postkit/committed.json
 */
export async function saveCommittedState(state: CommittedState): Promise<void> {
  const committedFilePath = getCommittedFilePath();
  await fs.writeFile(committedFilePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Adds a new committed migration to the committed state
 */
export async function addCommittedMigration(migration: CommittedMigration): Promise<void> {
  const state = await getCommittedState();
  state.migrations.push(migration);
  await saveCommittedState(state);
}

/**
 * Gets all committed migrations from local state
 */
export async function getAllCommittedMigrations(): Promise<CommittedMigration[]> {
  const state = await getCommittedState();
  return state.migrations;
}

/**
 * Queries the schema_migrations table on a remote database
 * and returns the set of applied migration version timestamps.
 */
async function getAppliedMigrationVersions(remoteUrl: string): Promise<Set<string>> {
  const client = new Client({connectionString: remoteUrl});

  try {
    await client.connect();

    // Check if schema_migrations table exists
    const tableCheck = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations' LIMIT 1",
    );

    if (tableCheck.rows.length === 0) {
      return new Set();
    }

    const result = await client.query("SELECT version FROM schema_migrations");
    return new Set(result.rows.map((row: {version: string}) => row.version));
  } catch {
    return new Set();
  } finally {
    await client.end();
  }
}

/**
 * Gets committed migrations that have NOT been applied to the given remote database.
 * Checks the remote's schema_migrations table as the source of truth.
 */
export async function getPendingCommittedMigrations(remoteUrl: string): Promise<CommittedMigration[]> {
  const state = await getCommittedState();

  if (state.migrations.length === 0) {
    return [];
  }

  const appliedVersions = await getAppliedMigrationVersions(remoteUrl);

  return state.migrations.filter(m => !appliedVersions.has(m.migrationFile.timestamp));
}
