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
  pendingChanges: {
    planned: boolean;
    applied: boolean;
    planFile: string | null;
    migrationFiles: {name: string; path: string}[];
    description: string | null;
    schemaFingerprint: string | null;
    migrationApplied: boolean;
    grantsApplied: boolean;
    seedsApplied: boolean;
  };
}

export interface CommittedMigration {
  migrationFile: {name: string; path: string; timestamp: string};
  description: string;
  sessionMigrations: {name: string; path: string}[];
  committedAt: string;
  deployed: boolean;
  deployedAt?: string;
}

export interface CommittedState {
  migrations: CommittedMigration[];
}
