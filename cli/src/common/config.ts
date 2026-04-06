import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

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
export const POSTKIT_DIR = ".postkit";

export function getConfigFilePath(): string {
  return path.join(projectRoot, POSTKIT_CONFIG_FILE);
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

// Remote configuration
export interface RemoteConfig {
  url: string;
  default?: boolean;
  addedAt?: string;
}

// PostkitConfig interface matching the JSON structure
export interface PostkitConfig {
  db: {
    localDbUrl: string;
    schemaPath: string;
    schema: string;
    remotes?: Record<string, RemoteConfig>;
  };
  auth: {
    source: {
      url: string;
      adminUser: string;
      adminPass: string;
      realm: string;
    };
    target: {
      url: string;
      adminUser: string;
      adminPass: string;
    };
    configCliImage?: string;
  };
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
      `Run \"postkit init\" to initialize your project first.`
    );
  }
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
  const parsed = JSON.parse(raw);

  // Auto-migrate from old config format (remoteDbUrl/environments to remotes)
  if (parsed.db && (parsed.db.remoteDbUrl || parsed.db.environments)) {
    if (!parsed.db.remotes || Object.keys(parsed.db.remotes).length === 0) {
      // Migrate remoteDbUrl to default remote
      if (parsed.db.remoteDbUrl) {
        parsed.db.remotes = parsed.db.remotes || {};
        parsed.db.remotes.default = {
          url: parsed.db.remoteDbUrl,
          default: true,
          addedAt: new Date().toISOString(),
        };
        delete parsed.db.remoteDbUrl;
      }

      // Migrate environments to named remotes
      if (parsed.db.environments) {
        parsed.db.remotes = parsed.db.remotes || {};
        for (const [name, url] of Object.entries(parsed.db.environments)) {
          if (name !== "default" && typeof url === "string") {
            parsed.db.remotes[name] = {
              url,
              addedAt: new Date().toISOString(),
            };
          }
        }
        delete parsed.db.environments;
      }

      // Save migrated config
      fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8");
    }
  }

  cachedConfig = parsed as PostkitConfig;
  return cachedConfig;
}
