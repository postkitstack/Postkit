/**
 * Session-related types
 */

export interface SessionState {
  active: boolean;
  startedAt: string;
  clonedAt: string;
  remoteName?: string;
  localDbUrl: string;
  remoteDbUrl: string;
  containerID?: string;
  pendingChanges: {
    planned: boolean;
    applied: boolean;
    planFiles: Record<string, string | null>;
    migrationFiles: {name: string; path: string}[];
    description: string | null;
    schemaFingerprints: Record<string, string | null>;
    migrationApplied: boolean;
    seedsApplied: boolean;
  };
}

export interface CommittedMigration {
  migrationFile: {name: string; path: string; timestamp: string};
  description: string;
  sessionMigrations: {name: string; path: string}[];
  committedAt: string;
}

export interface CommittedState {
  migrations: CommittedMigration[];
}
