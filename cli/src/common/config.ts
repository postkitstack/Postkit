import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import type {DbInputConfig} from "../modules/db/types/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI root is the `cli` folder
const isBuilt = __dirname.endsWith("dist");
export const cliRoot = isBuilt
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "..", "..");

// Project root is where the user runs the command
export const projectRoot = process.cwd();

// Postkit project paths
export const POSTKIT_CONFIG_FILE = "postkit.config.json";
export const POSTKIT_SECRETS_FILE = "postkit.secrets.json";
export const POSTKIT_DIR = ".postkit";

export function getConfigFilePath(): string {
  return path.join(projectRoot, POSTKIT_CONFIG_FILE);
}

export function getSecretsFilePath(): string {
  return path.join(projectRoot, POSTKIT_SECRETS_FILE);
}

export function getPostkitDir(): string {
  return path.join(projectRoot, POSTKIT_DIR);
}

export function getPostkitAuthDir(): string {
  return path.join(projectRoot, POSTKIT_DIR, "auth");
}

export function getVendorDir(): string {
  return path.join(cliRoot, "vendor");
}

// Re-export db types for convenience (single source of truth is db/types/config.ts)
export type {DbInputConfig, RemoteInputConfig, RemoteConfig, DbConfig} from "../modules/db/types/config";

// Auth configuration types (defined here since auth module doesn't have a separate types file)
export interface AuthSourceConfig {
  url: string;
  adminUser: string;
  adminPass: string;
  realm: string;
}

export interface AuthTargetConfig {
  url: string;
  adminUser: string;
  adminPass: string;
}

export interface AuthInputConfig {
  source: AuthSourceConfig;
  target: AuthTargetConfig;
  configCliImage?: string;
}

// ─── Public config (committed to git) ───────────────────────────────────────
// Non-sensitive project settings: schema paths, docker images, etc.
// Remotes are user/environment-specific and live entirely in secrets.

export interface DbPublicConfig {
  schemaPath?: string;
  schema?: string;
}

export interface AuthPublicConfig {
  configCliImage?: string;
}

export interface PostkitPublicConfig {
  db?: DbPublicConfig;
  auth?: AuthPublicConfig;
}

// ─── Secrets (gitignored) ─────────────────────────────────────────────────────
// Sensitive credentials: DB URLs, passwords, auth tokens.
// Remotes are fully stored here (url + metadata).

export interface RemoteSecretConfig {
  url: string;
  default?: boolean;
  addedAt?: string;
}

export interface DbSecretsConfig {
  localDbUrl?: string;
  remotes?: Record<string, RemoteSecretConfig>;
}

export interface AuthSecretsConfig {
  source?: Partial<AuthSourceConfig>;
  target?: Partial<AuthTargetConfig>;
}

export interface PostkitSecrets {
  db?: DbSecretsConfig;
  auth?: AuthSecretsConfig;
}

// ─── Merged runtime config ────────────────────────────────────────────────────

// PostkitConfig interface matching the JSON structure
export interface PostkitConfig {
  db: DbInputConfig;
  auth: AuthInputConfig;
}

let cachedConfig: PostkitConfig | null = null;

export function invalidateConfig(): void {
  cachedConfig = null;
}

/**
 * Check if postkit project is initialized
 * Throws error if not initialized
 */
export function checkInitialized(): void {
  const configPath = getConfigFilePath();

  if (!fs.existsSync(configPath)) {
    throw new Error(
      "Postkit project is not initialized.\n" +
        `Run "postkit init" to initialize your project first.`,
    );
  }
}

/**
 * Deep-merge two plain objects. Values in `override` win over `base`.
 * Only plain objects are recursed into; primitives and arrays are replaced wholesale.
 */
function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result: T = {...base};
  for (const key of Object.keys(override) as (keyof T)[]) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (
      overrideVal !== null &&
      overrideVal !== undefined &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      baseVal !== undefined &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as object, overrideVal as object) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

export function loadPostkitConfig(): PostkitConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getConfigFilePath();

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${POSTKIT_CONFIG_FILE}\nRun "postkit init" to initialize your project.`,
    );
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  let parsed: Record<string, unknown> = JSON.parse(raw);

  // Auto-migrate from old config format (remoteDbUrl/environments to remotes)
  if (parsed.db && (parsed.db as Record<string, unknown>).remoteDbUrl || parsed.db && (parsed.db as Record<string, unknown>).environments) {
    const db = parsed.db as Record<string, unknown>;
    if (!db.remotes || Object.keys(db.remotes as object).length === 0) {
      if (db.remoteDbUrl) {
        db.remotes = db.remotes || {};
        (db.remotes as Record<string, unknown>).default = {
          url: db.remoteDbUrl,
          default: true,
          addedAt: new Date().toISOString(),
        };
        delete db.remoteDbUrl;
      }

      if (db.environments) {
        db.remotes = db.remotes || {};
        for (const [name, url] of Object.entries(db.environments as Record<string, unknown>)) {
          if (name !== "default" && typeof url === "string") {
            (db.remotes as Record<string, unknown>)[name] = {
              url,
              addedAt: new Date().toISOString(),
            };
          }
        }
        delete db.environments;
      }

      fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8");
    }
  }

  // Load and merge secrets file if it exists
  const secretsPath = getSecretsFilePath();
  if (fs.existsSync(secretsPath)) {
    const secretsRaw = fs.readFileSync(secretsPath, "utf-8");
    const secrets: PostkitSecrets = JSON.parse(secretsRaw);
    parsed = deepMerge(parsed as object, secrets as object) as Record<string, unknown>;
  }

  cachedConfig = parsed as unknown as PostkitConfig;
  return cachedConfig;
}
