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

// PostkitConfig interface matching the JSON structure
export interface PostkitConfig {
  db: {
    remoteDbUrl: string;
    localDbUrl: string;
    schemaPath: string;
    migrationsPath: string;
    schema: string;
    pgSchemaBin: string;
    dbmateBin: string;
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
    rawExportDir: string;
    cleanOutputDir: string;
    outputFilename: string;
    configCliImage: string;
  };
}

let cachedConfig: PostkitConfig | null = null;

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
  cachedConfig = JSON.parse(raw) as PostkitConfig;
  return cachedConfig;
}
