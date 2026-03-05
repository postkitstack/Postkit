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
  };
}

export interface Config {
  remoteDbUrl: string;
  localDbUrl: string;
  schemaPath: string;
  migrationsPath: string;
  pgSchemaBin: string;
  dbmateBin: string;
  cliRoot: string;
  projectRoot: string;
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
