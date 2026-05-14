import crypto from "crypto";
import fs from "fs";
import path from "path";
import {z} from "zod";
import {getPostkitDir, loadPostkitConfig, getSecretsFilePath} from "../../../common/config";
import type {
  StackConfig,
  StackPostgresConfig,
  StackKeycloakConfig,
  StackPostgrestConfig,
  StackTraefikConfig,
  StackSecretsConfig,
  StackJwksSecrets,
  StackJwkKey,
  StackClientSecrets,
} from "../types/config";

// Re-export for convenience
export type {StackConfig, StackSecretsConfig} from "../types/config";

// ============================================
// Constants & Defaults
// ============================================

const DEFAULT_POSTGRES_IMAGE = "postgres:16-alpine";
const DEFAULT_KEYCLOAK_IMAGE = "quay.io/keycloak/keycloak:26.6";
const DEFAULT_POSTGREST_IMAGE = "postgrest/postgrest:latest";
const DEFAULT_TRAEFIK_IMAGE = "traefik:v3.3";
const DEFAULT_NETWORK = "postkit-net";

const DEFAULT_POSTGRES_PORT = 25432;
const DEFAULT_KEYCLOAK_PORT = 28080;
const DEFAULT_POSTGREST_PORT = 3000;
const DEFAULT_TRAEFIK_HTTP_PORT = 80;
const DEFAULT_TRAEFIK_DASHBOARD_PORT = 8080;

// ============================================
// Zod Schemas
// ============================================

const PostgresPublicSchema = z.object({
  enabled: z.boolean().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  pgVersion: z.number().int().min(12).max(18).optional(),
  image: z.string().min(1).optional(),
  database: z.string().min(1).optional(),
  volume: z.string().min(1).optional(),
});

const KeycloakPublicSchema = z.object({
  enabled: z.boolean().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  image: z.string().min(1).optional(),
  realm: z.string().min(1).optional(),
  volume: z.string().min(1).optional(),
  clientRealm: z.string().min(1).optional(),
  clients: z.array(z.string()).optional(),
});

const PostgrestPublicSchema = z.object({
  enabled: z.boolean().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  image: z.string().min(1).optional(),
  dbSchema: z.string().min(1).optional(),
  dbAnonRole: z.string().min(1).optional(),
});

const TraefikPublicSchema = z.object({
  enabled: z.boolean().optional(),
  httpPort: z.number().int().min(1).max(65535).optional(),
  dashboardPort: z.number().int().min(1).max(65535).optional(),
  image: z.string().min(1).optional(),
});

const StackPublicSchema = z.object({
  postgres: PostgresPublicSchema.optional(),
  keycloak: KeycloakPublicSchema.optional(),
  postgrest: PostgrestPublicSchema.optional(),
  traefik: TraefikPublicSchema.optional(),
  network: z.string().min(1).optional(),
});

const PostgresSecretsSchema = z.object({
  user: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
});

const KeycloakSecretsSchema = z.object({
  adminUser: z.string().min(1).optional(),
  adminPassword: z.string().min(1).optional(),
});

const StackSecretsSchema = z.object({
  postgres: PostgresSecretsSchema.optional(),
  keycloak: KeycloakSecretsSchema.optional(),
});

// ============================================
// Helpers
// ============================================

function generateSecret(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

function generateOctJwk(kid = "postkit-signing-key"): StackJwkKey {
  const k = crypto.randomBytes(32).toString("base64url");
  return {kty: "oct", kid, alg: "HS256", k};
}

function formatZodErrors(error: z.ZodError): string {
  const lines = ["Invalid stack configuration:"];
  for (const issue of error.issues) {
    const p = issue.path.join(".");
    lines.push(`  - ${p}: ${issue.message}`);
  }
  return lines.join("\n");
}

// ============================================
// Config Loader
// ============================================

export function getStackConfig(): StackConfig {
  const config = loadPostkitConfig();
  const raw = config.stack ?? {};

  // Validate public config
  const pubResult = StackPublicSchema.safeParse(raw);
  if (!pubResult.success) {
    throw new Error(formatZodErrors(pubResult.error));
  }
  const pub = pubResult.data;

  // Validate secrets
  const secretsRaw = (raw as Record<string, unknown>).postgres ||
    (raw as Record<string, unknown>).keycloak ||
    (raw as Record<string, unknown>).postgrest
    ? raw
    : {};

  const secResult = StackSecretsSchema.safeParse(secretsRaw);
  if (!secResult.success) {
    throw new Error(formatZodErrors(secResult.error));
  }
  // Secrets are already merged into config by loadPostkitConfig()

  // Build resolved configs
  const pg = raw as Record<string, unknown>;
  const pgPub = (pub.postgres ?? {}) as Record<string, unknown>;
  const kcPub = (pub.keycloak ?? {}) as Record<string, unknown>;
  const prPub = (pub.postgrest ?? {}) as Record<string, unknown>;
  const trPub = (pub.traefik ?? {}) as Record<string, unknown>;

  const postgres: StackPostgresConfig = {
    image: (pgPub.image as string) ?? DEFAULT_POSTGRES_IMAGE,
    enabled: (pgPub.enabled as boolean) ?? true,
    port: (pgPub.port as number) ?? DEFAULT_POSTGRES_PORT,
    user: (pg.user as string) ?? "postgres",
    password: (pg.password as string) ?? "",
    database: (pgPub.database as string) ?? "postkit",
    pgVersion: (pgPub.pgVersion as number) ?? 16,
    volume: (pgPub.volume as string) ?? "postkit-pgdata",
  };

  const kcRealm = (kcPub.realm as string) ?? "postkit";
  const keycloak: StackKeycloakConfig = {
    image: (kcPub.image as string) ?? DEFAULT_KEYCLOAK_IMAGE,
    enabled: (kcPub.enabled as boolean) ?? true,
    port: (kcPub.port as number) ?? DEFAULT_KEYCLOAK_PORT,
    adminUser: (pg.adminUser as string) ?? "admin",
    adminPassword: (pg.adminPassword as string) ?? "",
    realm: kcRealm,
    clientRealm: (kcPub.clientRealm as string) ?? kcRealm,
    volume: (kcPub.volume as string) ?? "postkit-keycloak-data",
  };

  const keycloakClients: string[] = (kcPub.clients as string[]) ?? [];

  const postgrest: StackPostgrestConfig = {
    image: (prPub.image as string) ?? DEFAULT_POSTGREST_IMAGE,
    enabled: (prPub.enabled as boolean) ?? true,
    port: (prPub.port as number) ?? DEFAULT_POSTGREST_PORT,
    dbSchema: (prPub.dbSchema as string) ?? "public",
    dbAnonRole: (prPub.dbAnonRole as string) ?? "anon",
  };

  const traefik: StackTraefikConfig = {
    image: (trPub.image as string) ?? DEFAULT_TRAEFIK_IMAGE,
    enabled: (trPub.enabled as boolean) ?? true,
    httpPort: (trPub.httpPort as number) ?? DEFAULT_TRAEFIK_HTTP_PORT,
    dashboardPort: (trPub.dashboardPort as number) ?? DEFAULT_TRAEFIK_DASHBOARD_PORT,
  };

  // Read jwks / jwk / clients from secrets (populated by ensureStackSecrets / stack keys)
  const secretsFile: Record<string, unknown> = fs.existsSync(getSecretsFilePath())
    ? JSON.parse(fs.readFileSync(getSecretsFilePath(), "utf-8"))
    : {};
  const ss = ((secretsFile.stack ?? {}) as Record<string, unknown>);

  const jwks: StackJwksSecrets = (ss.jwks as StackJwksSecrets) ?? {keys: []};
  const jwk: StackJwkKey | undefined = ss.jwk as StackJwkKey | undefined;
  const clients: Record<string, StackClientSecrets> | undefined =
    ss.clients as Record<string, StackClientSecrets> | undefined;

  return {
    postgres,
    keycloak,
    postgrest,
    traefik,
    network: pub.network ?? DEFAULT_NETWORK,
    jwks,
    jwk,
    clients,
    keycloakClients,
  };
}

// ============================================
// Secrets Auto-Generation
// ============================================

/**
 * Ensure all required secrets have values. Generates random ones for any that
 * are empty and writes them back to postkit.secrets.json.
 * Returns the updated StackConfig.
 */
export function ensureStackSecrets(config: StackConfig): StackConfig {
  let needsWrite = false;
  const secretsPath = getSecretsFilePath();

  // Read current secrets file
  const secrets: Record<string, unknown> = fs.existsSync(secretsPath)
    ? JSON.parse(fs.readFileSync(secretsPath, "utf-8"))
    : {};

  const stackSecrets = ((secrets.stack ?? {}) as Record<string, Record<string, string>>);
  if (!secrets.stack) {
    secrets.stack = {};
  }
  const ss = secrets.stack as Record<string, Record<string, string>>;

  // Ensure postgres secrets
  if (!ss.postgres) ss.postgres = {};
  if (!config.postgres.password) {
    if (!ss.postgres.password) {
      ss.postgres.password = generateSecret(16);
      needsWrite = true;
    }
    config.postgres.password = ss.postgres.password;
  }
  if (!ss.postgres.user) {
    ss.postgres.user = config.postgres.user;
    needsWrite = true;
  } else {
    config.postgres.user = ss.postgres.user;
  }

  // Ensure keycloak secrets
  if (!ss.keycloak) ss.keycloak = {};
  if (!config.keycloak.adminPassword) {
    if (!ss.keycloak.adminPassword) {
      ss.keycloak.adminPassword = generateSecret(16);
      needsWrite = true;
    }
    config.keycloak.adminPassword = ss.keycloak.adminPassword;
  }
  if (!ss.keycloak.adminUser) {
    ss.keycloak.adminUser = config.keycloak.adminUser;
    needsWrite = true;
  } else {
    config.keycloak.adminUser = ss.keycloak.adminUser;
  }

  // Ensure jwks — auto-generate initial oct key if absent
  const jwksEntry = ss.jwks as {keys?: StackJwkKey[]; urlSigningKey?: StackJwkKey} | undefined;
  if (!jwksEntry || !jwksEntry.keys || jwksEntry.keys.length === 0) {
    const octKey = generateOctJwk("storage-url-signing-key");
    ss.jwks = {keys: [octKey], urlSigningKey: octKey} as unknown as Record<string, string>;
    config.jwks = {keys: [octKey], urlSigningKey: octKey};
    needsWrite = true;
  } else {
    config.jwks = jwksEntry as StackJwksSecrets;
  }

  if (needsWrite) {
    fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2) + "\n", "utf-8");
  }

  return config;
}

// ============================================
// Path Helpers
// ============================================

export function getStackDir(): string {
  return path.join(getPostkitDir(), "stack");
}

export function getComposeFilePath(): string {
  return path.join(getStackDir(), "docker-compose.yml");
}
