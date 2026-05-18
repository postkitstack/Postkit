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
  clientRealm: string;
  volume: string;
  realmTemplate: string;
}

export interface StackPostgrestConfig {
  image: string;
  enabled: boolean;
  port: number;
  dbSchema: string;
  dbAnonRole: string;
}

// ============================================
// JWKS / JWK Types
// ============================================

export interface StackJwkKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  k?: string;
  key_ops?: string[];
}

export interface StackJwksSecrets {
  keys: StackJwkKey[];
  urlSigningKey?: StackJwkKey;
}

export interface StackClientSecrets {
  secret?: string;
  token?: string;
}

export interface StackTraefikConfig {
  image: string;
  enabled: boolean;
  httpPort: number;
  dashboardPort: number;
}

// ============================================
// Fully Resolved Runtime Config
// ============================================

export interface StackConfig {
  postgres: StackPostgresConfig;
  keycloak: StackKeycloakConfig;
  postgrest: StackPostgrestConfig;
  traefik: StackTraefikConfig;
  network: string;
  jwks: StackJwksSecrets;
  jwk?: StackJwkKey;
  clients?: Record<string, StackClientSecrets>;
  keycloakClients: string[];
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
  clientRealm?: string;
  clients?: string[];
  realmTemplate?: string;
}

export interface StackPostgrestPublicConfig {
  enabled?: boolean;
  port?: number;
  image?: string;
  dbSchema?: string;
  dbAnonRole?: string;
}

export interface StackTraefikPublicConfig {
  enabled?: boolean;
  httpPort?: number;
  dashboardPort?: number;
  image?: string;
}

export interface StackPublicConfig {
  postgres?: StackPostgresPublicConfig;
  keycloak?: StackKeycloakPublicConfig;
  postgrest?: StackPostgrestPublicConfig;
  traefik?: StackTraefikPublicConfig;
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

export interface StackSecretsConfig {
  postgres?: StackPostgresSecrets;
  keycloak?: StackKeycloakSecrets;
  jwks?: StackJwksSecrets;
  jwk?: StackJwkKey;
  clients?: Record<string, StackClientSecrets>;
}

// ============================================
// Stack Runtime State (.postkit/stack/state.json — gitignored)
// ============================================

export interface StackState {
  isInitial?: boolean;
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
