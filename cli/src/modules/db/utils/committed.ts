import fs from "fs/promises";
import {existsSync} from "fs";
import type {CommittedState, CommittedMigration} from "../types/index";
import {getCommittedFilePath} from "./db-config";

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
    return state;
  } catch (error) {
    // If file is corrupted, return empty state
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
 * Marks a migration as deployed
 */
export async function markMigrationDeployed(migrationFileName: string): Promise<void> {
  const state = await getCommittedState();
  const migration = state.migrations.find(m => m.migrationFile.name === migrationFileName);

  if (migration) {
    migration.deployed = true;
    migration.deployedAt = new Date().toISOString();
    await saveCommittedState(state);
  }
}

/**
 * Gets all pending (undeployed) committed migrations
 */
export async function getPendingCommittedMigrations(): Promise<CommittedMigration[]> {
  const state = await getCommittedState();
  return state.migrations.filter(m => !m.deployed);
}

/**
 * Gets all deployed committed migrations
 */
export async function getDeployedMigrations(): Promise<CommittedMigration[]> {
  const state = await getCommittedState();
  return state.migrations.filter(m => m.deployed);
}

/**
 * Clears all committed migrations (useful for testing/reset)
 */
export async function clearCommittedMigrations(): Promise<void> {
  await saveCommittedState({migrations: []});
}
