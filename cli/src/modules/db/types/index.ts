export interface SessionState {
  active: boolean;
  startedAt: string;
  remoteSnapshot: string;
  localDbUrl: string;
  remoteDbUrl: string;
  pendingChanges: {
    planned: boolean;
    applied: boolean;
    planFile: string | null;
    migrationFiles: { name: string; path: string }[];
    description: string | null;
    schemaFingerprint: string | null;
    migrationApplied: boolean;
    grantsApplied: boolean;
    seedsApplied: boolean;
  };
}

export interface Config {
  remoteDbUrl: string;
  localDbUrl: string;
  schemaPath: string;
  migrationsPath: string;
  schema: string;
  pgSchemaBin: string;
  dbmateBin: string;
  cliRoot: string;
  projectRoot: string;
  environments: Record<string, string>;
}

export interface DatabaseConnectionInfo {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface PlanResult {
  hasChanges: boolean;
  planOutput: string;
  planFile: string | null;
}

export interface ApplyResult {
  success: boolean;
  output: string;
}

export interface MigrationFile {
  name: string;
  path: string;
  timestamp: string;
}

export interface GrantStatement {
  schema: string;
  content: string;
}

export interface SeedStatement {
  name: string;
  content: string;
}

export interface InfraStatement {
  name: string;
  content: string;
}

export interface CommittedMigration {
  migrationFile: { name: string; path: string; timestamp: string };
  description: string;
  sessionMigrations: { name: string; path: string }[];
  committedAt: string;
  deployed: boolean;
  deployedAt?: string;
}

export interface CommittedState {
  migrations: CommittedMigration[];
}
