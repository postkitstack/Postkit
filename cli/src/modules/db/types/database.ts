/**
 * Database connection and operation types
 */

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
