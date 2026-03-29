import fs from "fs/promises";
import {existsSync} from "fs";
import type {SessionState} from "../types/index";
import {getSessionFilePath} from "./db-config";

export async function getSession(): Promise<SessionState | null> {
  const sessionPath = getSessionFilePath();

  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = await fs.readFile(sessionPath, "utf-8");
    return JSON.parse(content) as SessionState;
  } catch {
    return null;
  }
}

export async function createSession(
  remoteDbUrl: string,
  localDbUrl: string,
): Promise<SessionState> {
  const now = new Date();
  const session: SessionState = {
    active: true,
    startedAt: now.toISOString(),
    remoteSnapshot: formatTimestamp(now),
    localDbUrl,
    remoteDbUrl,
    pendingChanges: {
      planned: false,
      applied: false,
      planFile: null,
      migrationFiles: [],
      description: null,
      schemaFingerprint: null,
      migrationApplied: false,
      grantsApplied: false,
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
    await fs.unlink(sessionPath);
  }
}

export async function hasActiveSession(): Promise<boolean> {
  const session = await getSession();
  return session !== null && session.active;
}

async function saveSession(session: SessionState): Promise<void> {
  const sessionPath = getSessionFilePath();
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), "utf-8");
}

function formatTimestamp(date: Date): string {
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
