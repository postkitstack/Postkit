import {existsSync} from "fs";
import type {CommittedState, CommittedMigration} from "../types/index";
import {getCommittedFilePath} from "./db-config";
import {readJsonFile, writeJsonFile} from "./json-file";
import {withPgClient} from "../services/database";
import {
  CHECK_MIGRATIONS_TABLE_EXISTS,
  GET_APPLIED_VERSIONS,
} from "../config/queries";
import {logger} from "../../../common/logger";

/**
 * Reads the committed state from .postkit/committed.json
 */
export async function getCommittedState(): Promise<CommittedState> {
  const committedFilePath = getCommittedFilePath();

  if (!existsSync(committedFilePath)) {
    return {migrations: []};
  }

  try {
    const state = await readJsonFile<CommittedState>(committedFilePath);
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
  await writeJsonFile(committedFilePath, state);
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
 * Queries the postkit.schema_migrations table on a remote database
 * and returns the set of applied migration version timestamps.
 */
async function getAppliedMigrationVersions(remoteUrl: string): Promise<Set<string>> {
  try {
    return await withPgClient(remoteUrl, async (client) => {
      // Check if migrations table exists in postkit schema
      const tableCheck = await client.query(CHECK_MIGRATIONS_TABLE_EXISTS);
      if (tableCheck.rows.length === 0) {
        return new Set<string>();
      }
      const result = await client.query(GET_APPLIED_VERSIONS);
      return new Set(result.rows.map((row: {version: string}) => row.version));
    });
  } catch {
    return new Set();
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
