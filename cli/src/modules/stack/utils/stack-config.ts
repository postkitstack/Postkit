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
  StackSecretsConfig,
} from "../types/config";

// Re-export for convenience
export type {StackConfig, StackSecretsConfig} from "../types/config";

// ============================================
// Constants & Defaults
// ============================================

const DEFAULT_POSTGRES_IMAGE = "postgres:16-alpine";
const DEFAULT_KEYCLOAK_IMAGE = "quay.io/keycloak/keycloak:26.6";
const DEFAULT_POSTGREST_IMAGE = "postgrest/postgrest:latest";
const DEFAULT_NETWORK = "postkit-net";

const DEFAULT_POSTGRES_PORT = 25432;
const DEFAULT_KEYCLOAK_PORT = 28080;
const DEFAULT_POSTGREST_PORT = 3000;

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
});

const PostgrestPublicSchema = z.object({
  enabled: z.boolean().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  image: z.string().min(1).optional(),
  dbSchema: z.string().min(1).optional(),
  dbAnonRole: z.string().min(1).optional(),
});

const StackPublicSchema = z.object({
  postgres: PostgresPublicSchema.optional(),
  keycloak: KeycloakPublicSchema.optional(),
  postgrest: PostgrestPublicSchema.optional(),
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

const PostgrestSecretsSchema = z.object({
  jwtSecret: z.string().min(1).optional(),
});

const StackSecretsSchema = z.object({
  postgres: PostgresSecretsSchema.optional(),
  keycloak: KeycloakSecretsSchema.optional(),
  postgrest: PostgrestSecretsSchema.optional(),
});

// ============================================
// Helpers
// ============================================

function generateSecret(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
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

  const keycloak: StackKeycloakConfig = {
    image: (kcPub.image as string) ?? DEFAULT_KEYCLOAK_IMAGE,
    enabled: (kcPub.enabled as boolean) ?? true,
    port: (kcPub.port as number) ?? DEFAULT_KEYCLOAK_PORT,
    adminUser: (pg.adminUser as string) ?? "admin",
    adminPassword: (pg.adminPassword as string) ?? "",
    realm: (kcPub.realm as string) ?? "postkit",
    volume: (kcPub.volume as string) ?? "postkit-keycloak-data",
  };

  const postgrest: StackPostgrestConfig = {
    image: (prPub.image as string) ?? DEFAULT_POSTGREST_IMAGE,
    enabled: (prPub.enabled as boolean) ?? true,
    port: (prPub.port as number) ?? DEFAULT_POSTGREST_PORT,
    dbSchema: (prPub.dbSchema as string) ?? "public",
    dbAnonRole: (prPub.dbAnonRole as string) ?? "anon",
    jwtSecret: (pg.jwtSecret as string) ?? "",
  };

  return {
    postgres,
    keycloak,
    postgrest,
    network: pub.network ?? DEFAULT_NETWORK,
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

  // Ensure postgrest secrets
  if (!ss.postgrest) ss.postgrest = {};
  if (!config.postgrest.jwtSecret) {
    if (!ss.postgrest.jwtSecret) {
      ss.postgrest.jwtSecret = generateSecret(32);
      needsWrite = true;
    }
    config.postgrest.jwtSecret = ss.postgrest.jwtSecret;
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
