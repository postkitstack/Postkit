/**
 * DB module types - single source of truth for db configuration
 */

// ============================================
// Input Config Types (from postkit.config.json)
// ============================================

export interface RemoteInputConfig {
  url: string;
  default?: boolean;
  addedAt?: string;
}

export interface DbInputConfig {
  localDbUrl: string;
  schemaPath?: string;
  schema?: string;
  remotes?: Record<string, RemoteInputConfig>;
}

// ============================================
// Runtime Config Types (resolved paths, binaries)
// ============================================

export interface RemoteConfig {
  url: string;
  default?: boolean;
  addedAt?: string;
}

export interface DbConfig {
  localDbUrl: string;
  schemaPath: string;
  schema: string;
  remotes: Record<string, RemoteConfig>;
  pgSchemaBin: string;
  dbmateBin: string;
  cliRoot: string;
  projectRoot: string;
}
