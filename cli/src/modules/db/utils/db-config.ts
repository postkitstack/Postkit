import path from "path";
import {existsSync} from "fs";
import {resolveBinary as resolveDbmateBinary} from "dbmate";
import {cliRoot, projectRoot, loadPostkitConfig, getPostkitDir, getVendorDir} from "../../../common/config";
import type {Config} from "../types/index";

// Map Node.js platform/arch values to Go-style names used in pgschema binaries
const PLATFORM_MAP: Record<string, string> = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
};

const ARCH_MAP: Record<string, string> = {
  x64: "amd64",
  arm64: "arm64",
};

/**
 * Resolves the pgschema binary path with the following priority:
 * 1. User-specified custom path (anything other than "pgschema" or empty)
 * 2. Bundled binary in vendor/pgschema/pgschema-{platform}-{arch}[.exe]
 * 3. System PATH fallback ("pgschema")
 */
function resolvePgSchemaBin(configValue: string | undefined): string {
  // If user explicitly set a custom path, use it
  if (configValue && configValue !== "pgschema") {
    return configValue;
  }

  // Try bundled vendor binary
  const platform = PLATFORM_MAP[process.platform];
  const arch = ARCH_MAP[process.arch];

  if (platform && arch) {
    const ext = process.platform === "win32" ? ".exe" : "";
    const binaryName = `pgschema-${platform}-${arch}${ext}`;
    const vendorPath = path.join(getVendorDir(), "pgschema", binaryName);

    if (existsSync(vendorPath)) {
      return vendorPath;
    }
  }

  // Fallback to system PATH
  return "pgschema";
}

/**
 * Resolves the dbmate binary path with the following priority:
 * 1. User-specified custom path (anything other than "dbmate" or empty)
 * 2. npm-installed dbmate binary (via dbmate npm package)
 * 3. System PATH fallback ("dbmate")
 */
function resolveDbmateBin(configValue: string | undefined): string {
  // If user explicitly set a custom path, use it
  if (configValue && configValue !== "dbmate") {
    return configValue;
  }

  // Try npm-installed dbmate binary
  try {
    return resolveDbmateBinary();
  } catch {
    // Package not installed or binary not found for this platform
  }

  // Fallback to system PATH
  return "dbmate";
}

export function getConfig(): Config {
  const config = loadPostkitConfig();

  const remoteDbUrl = config.db.remoteDbUrl;
  const localDbUrl = config.db.localDbUrl;

  if (!remoteDbUrl) {
    throw new Error(
      "db.remoteDbUrl is not set in postkit.config.json",
    );
  }

  if (!localDbUrl) {
    throw new Error(
      "db.localDbUrl is not set in postkit.config.json",
    );
  }

  const schemaPath = config.db.schemaPath
    ? path.resolve(projectRoot, config.db.schemaPath)
    : path.resolve(projectRoot, "schema");

  const migrationsPath = config.db.migrationsPath
    ? path.resolve(projectRoot, config.db.migrationsPath)
    : path.resolve(projectRoot, "migrations");

  return {
    remoteDbUrl,
    localDbUrl,
    schemaPath,
    migrationsPath,
    schema: config.db.schema || "public",
    pgSchemaBin: resolvePgSchemaBin(config.db.pgSchemaBin),
    dbmateBin: resolveDbmateBin(config.db.dbmateBin),
    cliRoot,
    projectRoot,
    environments: config.db.environments || {},
  };
}

export function getSessionFilePath(): string {
  return path.join(getPostkitDir(), "session.json");
}

export function getPlanFilePath(): string {
  return path.join(getPostkitDir(), "plan.sql");
}

export function getGeneratedSchemaPath(): string {
  return path.join(getPostkitDir(), "schema.sql");
}

export function getSessionMigrationsPath(): string {
  return path.join(getPostkitDir(), "migrations");
}

export function getCommittedFilePath(): string {
  return path.join(getPostkitDir(), "committed.json");
}
