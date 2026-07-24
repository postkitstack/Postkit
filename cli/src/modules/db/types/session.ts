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
  /**
   * When false, this migration is excluded from the "pending migrations" check
   * that blocks `db start`. Used for bootstrap migrations scaffolded by `init`
   * (e.g. storage.migrations) that haven't gone through the session workflow
   * and shouldn't stop a brand-new project's first session. Defaults to true
   * (blocking) when omitted, so existing user-committed migrations are unaffected.
   */
  blocksSessionStart?: boolean;
}

export interface CommittedState {
  migrations: CommittedMigration[];
}
