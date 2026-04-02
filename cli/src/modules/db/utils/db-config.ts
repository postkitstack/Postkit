import path from "path";
import {existsSync} from "fs";
import {resolveBinary as resolveDbmateBinary} from "dbmate";
import {cliRoot, projectRoot, loadPostkitConfig, getPostkitDir, getVendorDir} from "../../../common/config";

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
 * Resolves the pgschema binary path from bundled vendor directory.
 * Falls back to system PATH if bundled binary not found.
 */
function resolvePgSchemaBin(): string {
  // Try bundled vendor binary first
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
 * Resolves the dbmate binary path from npm package.
 * Falls back to system PATH if npm binary not found.
 */
function resolveDbmateBin(): string {
  // Try npm-installed dbmate binary first
  try {
    return resolveDbmateBinary();
  } catch {
    // Package not installed or binary not found for this platform
  }

  // Fallback to system PATH
  return "dbmate";
}

export function getConfig() {
  const config = loadPostkitConfig();

  const localDbUrl = config.db.localDbUrl;

  if (!localDbUrl) {
    throw new Error(
      "db.localDbUrl is not set in postkit.config.json",
    );
  }

  const schemaPath = config.db.schemaPath
    ? path.resolve(projectRoot, config.db.schemaPath)
    : path.resolve(projectRoot, "schema");

  return {
    localDbUrl,
    schemaPath,
    schema: config.db.schema || "public",
    pgSchemaBin: resolvePgSchemaBin(),
    dbmateBin: resolveDbmateBin(),
    cliRoot,
    projectRoot,
  };
}

export function getPostkitDbDir(): string {
  return path.join(getPostkitDir(), "db");
}

export function getSessionFilePath(): string {
  return path.join(getPostkitDbDir(), "session.json");
}

export function getPlanFilePath(): string {
  return path.join(getPostkitDbDir(), "plan.sql");
}

export function getGeneratedSchemaPath(): string {
  return path.join(getPostkitDbDir(), "schema.sql");
}

export function getSessionMigrationsPath(): string {
  return path.join(getPostkitDbDir(), "session");
}

export function getCommittedMigrationsPath(): string {
  return path.join(getPostkitDbDir(), "migrations");
}

export function getCommittedFilePath(): string {
  return path.join(getPostkitDbDir(), "committed.json");
}
