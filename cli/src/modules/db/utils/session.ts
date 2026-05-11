import {existsSync} from "fs";
import fsp from "fs/promises";
import type {Ora} from "ora";
import type {SessionState} from "../types/index";
import {getSessionFilePath} from "./db-config";
import {readJsonFile, writeJsonFile} from "./json-file";
import {PostkitError} from "../../../common/errors";

export async function getSession(): Promise<SessionState | null> {
  const sessionPath = getSessionFilePath();

  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const state = await readJsonFile<SessionState>(sessionPath);
    if (!state || typeof state.active !== "boolean" || !state.pendingChanges) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export async function createSession(
  remoteDbUrl: string,
  localDbUrl: string,
  remoteName?: string,
  containerID?: string,
): Promise<SessionState> {
  const now = new Date();
  const session: SessionState = {
    active: true,
    startedAt: now.toISOString(),
    clonedAt: formatTimestamp(now),
    remoteName,
    localDbUrl,
    remoteDbUrl,
    containerID,
    pendingChanges: {
      planned: false,
      applied: false,
      planFile: null,
      migrationFiles: [],
      description: null,
      schemaFingerprint: null,
      migrationApplied: false,
      seedsApplied: false,
    },
  };

  await saveSession(session);
  return session;
}

export async function updateSession(
  updates: Partial<SessionState>,
): Promise<SessionState> {
  const session = await getSession();

  if (!session) {
    throw new Error("No active session found");
  }

  const updatedSession = {...session, ...updates};
  await saveSession(updatedSession);
  return updatedSession;
}

export async function updatePendingChanges(
  updates: Partial<SessionState["pendingChanges"]>,
): Promise<SessionState> {
  const session = await getSession();

  if (!session) {
    throw new Error("No active session found");
  }

  const updatedSession = {
    ...session,
    pendingChanges: {...session.pendingChanges, ...updates},
  };
  await saveSession(updatedSession);
  return updatedSession;
}

export async function deleteSession(): Promise<void> {
  const sessionPath = getSessionFilePath();

  if (existsSync(sessionPath)) {
    await fsp.unlink(sessionPath);
  }
}

export async function hasActiveSession(): Promise<boolean> {
  const session = await getSession();
  return session !== null && session.active;
}

export async function requireActiveSession(): Promise<SessionState> {
  const session = await getSession();
  if (!session || !session.active) {
    throw new PostkitError(
      "No active migration session.",
      'Run "postkit db start" to begin a new session.',
    );
  }
  return session;
}

export async function assertLocalConnection(session: SessionState, spinner: Ora): Promise<void> {
  const {testConnection} = await import("../services/database");
  spinner.start("Connecting to local database...");
  const connected = await testConnection(session.localDbUrl);
  if (!connected) {
    spinner.fail("Failed to connect to local database");
    throw new PostkitError(
      "Could not connect to the local database.",
      'The local clone may have been removed. Run "postkit db start" again.',
    );
  }
  spinner.succeed("Connected to local database");
}

async function saveSession(session: SessionState): Promise<void> {
  const sessionPath = getSessionFilePath();
  await writeJsonFile(sessionPath, session);
}

export function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export function formatSessionDuration(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
