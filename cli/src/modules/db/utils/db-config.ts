import path from "path";
import {existsSync} from "fs";
import {z} from "zod";
import {resolveBinary as resolveDbmateBinary} from "dbmate";
import {
  cliRoot,
  projectRoot,
  loadPostkitConfig,
  getPostkitDir,
  getVendorDir,
} from "../../../common/config";
import type {DbConfig, RemoteInputConfig} from "../types/config";

// Re-export types for convenience
export type {DbConfig, RemoteInputConfig, RemoteConfig, DbInputConfig} from "../types/config";

// ============================================
// Constants
// ============================================

/** dbmate migration tracking table (schema-qualified) */
export const MIGRATIONS_TABLE = "postkit.schema_migrations";

// ============================================
// Zod Schemas for Validation
// ============================================

const RemoteConfigInputSchema = z.object({
  url: z.string().min(1, "Required").refine(
    (val) => val.startsWith("postgres://") || val.startsWith("postgresql://"),
    "Must be a PostgreSQL URL (postgres:// or postgresql://)",
  ),
  default: z.boolean().nullish(),
  addedAt: z.string().nullish(),
});

const DbConfigInputSchema = z.object({
  localDbUrl: z.string().default(""),
  schemaPath: z.string().optional(),
  schemas: z.array(z.string()).optional(),
  infraPath: z.string().optional(),
  remotes: z.record(z.string(), RemoteConfigInputSchema).optional(),
});

// ============================================
// Binary Resolution
// ============================================

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

// ============================================
// Error Formatting
// ============================================

/**
 * Format Zod validation errors into user-friendly messages
 */
function formatZodErrors(error: z.ZodError): string {
  const lines = ["Invalid db configuration:"];
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    lines.push(`  • ${path}: ${issue.message}`);
  }
  return lines.join("\n");
}

// ============================================
// Config Loader
// ============================================

/**
 * Get validated db configuration
 * @throws Error if configuration is invalid
 */
export function getDbConfig(): DbConfig {
  const config = loadPostkitConfig();

  // Validate with Zod
  const result = DbConfigInputSchema.safeParse(config.db);

  if (!result.success) {
    throw new Error(formatZodErrors(result.error));
  }

  const db = result.data;

  // Resolve paths
  const schemaPath = db.schemaPath
    ? path.resolve(projectRoot, db.schemaPath)
    : path.resolve(projectRoot, "schema");

  const schemas = db.schemas && db.schemas.length > 0 ? db.schemas : ["public"];
  const infraPath = db.infraPath
    ? path.resolve(projectRoot, db.infraPath)
    : path.resolve(projectRoot, "db/infra");

  return {
    localDbUrl: db.localDbUrl,
    schemaPath,
    schemas,
    infraPath,
    remotes: (db.remotes || {}) as Record<string, RemoteInputConfig>,
    pgSchemaBin: resolvePgSchemaBin(),
    dbmateBin: resolveDbmateBin(),
    cliRoot,
    projectRoot,
  };
}


// ============================================
// Path Helpers
// ============================================

export function getPostkitDbDir(): string {
  return path.join(getPostkitDir(), "db");
}

export function getSessionFilePath(): string {
  return path.join(getPostkitDbDir(), "session.json");
}

export function getPlanFilePath(schemaName: string): string {
  return path.join(getPostkitDbDir(), `plan_${schemaName}.sql`);
}

export function getGeneratedSchemaPath(schemaName: string): string {
  return path.join(getPostkitDbDir(), `schema_${schemaName}.sql`);
}

export function getInfraPath(): string {
  return getDbConfig().infraPath;
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

export function getTmpImportDir(): string {
  return path.join(getPostkitDbDir(), "tmp-import");
}

/**
 * Convert an absolute path to a path relative to the project root.
 * Used when storing paths in session.json / committed.json for portability.
 */
export function toRelativePath(absolutePath: string): string {
  return path.relative(projectRoot, absolutePath);
}

/**
 * Resolve a relative path (from session.json / committed.json) back to absolute.
 * If the path is already absolute, returns it as-is (backward compatibility).
 */
export function resolveProjectPath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(projectRoot, filePath);
}
