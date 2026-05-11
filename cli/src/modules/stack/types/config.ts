/**
 * Stack module types - single source of truth for stack configuration
 */

// ============================================
// Per-Service Runtime Config (fully resolved with defaults)
// ============================================

export interface StackPostgresConfig {
  image: string;
  enabled: boolean;
  port: number;
  user: string;
  password: string;
  database: string;
  pgVersion: number;
  volume: string;
}

export interface StackKeycloakConfig {
  image: string;
  enabled: boolean;
  port: number;
  adminUser: string;
  adminPassword: string;
  realm: string;
  volume: string;
}

export interface StackPostgrestConfig {
  image: string;
  enabled: boolean;
  port: number;
  dbSchema: string;
  dbAnonRole: string;
  jwtSecret: string;
}

// ============================================
// Fully Resolved Runtime Config
// ============================================

export interface StackConfig {
  postgres: StackPostgresConfig;
  keycloak: StackKeycloakConfig;
  postgrest: StackPostgrestConfig;
  network: string;
}

// ============================================
// Public Config Shape (postkit.config.json — committed)
// ============================================

export interface StackPostgresPublicConfig {
  enabled?: boolean;
  port?: number;
  pgVersion?: number;
  image?: string;
  database?: string;
  volume?: string;
}

export interface StackKeycloakPublicConfig {
  enabled?: boolean;
  port?: number;
  image?: string;
  realm?: string;
  volume?: string;
}

export interface StackPostgrestPublicConfig {
  enabled?: boolean;
  port?: number;
  image?: string;
  dbSchema?: string;
  dbAnonRole?: string;
}

export interface StackPublicConfig {
  postgres?: StackPostgresPublicConfig;
  keycloak?: StackKeycloakPublicConfig;
  postgrest?: StackPostgrestPublicConfig;
  network?: string;
}

// ============================================
// Secrets Config Shape (postkit.secrets.json — gitignored)
// ============================================

export interface StackPostgresSecrets {
  user?: string;
  password?: string;
}

export interface StackKeycloakSecrets {
  adminUser?: string;
  adminPassword?: string;
}

export interface StackPostgrestSecrets {
  jwtSecret?: string;
}

export interface StackSecretsConfig {
  postgres?: StackPostgresSecrets;
  keycloak?: StackKeycloakSecrets;
  postgrest?: StackPostgrestSecrets;
}

// ============================================
// Docker Compose Status Types
// ============================================

export interface ServiceStatus {
  name: string;
  service: string;
  state: string;
  health: string;
  ports: string;
  publisherPort: number | null;
}
