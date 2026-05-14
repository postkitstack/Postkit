import path from "path";
import {z} from "zod";
import {getPostkitAuthDir, loadPostkitConfig} from "../../../common/config";
import type {AuthConfig} from "../types/config";

// Re-export types for convenience
export type {AuthConfig, AuthInputConfig} from "../types/config";

// ============================================
// Zod Schemas
// ============================================

const AuthSourceSchema = z.object({
  url: z.string().min(1, "Source URL is required"),
  adminUser: z.string().min(1, "Source admin user is required"),
  adminPass: z.string().min(1, "Source admin password is required"),
  realm: z.string().min(1, "Source realm is required"),
});

const AuthTargetSchema = z.object({
  url: z.string().min(1, "Target URL is required"),
  adminUser: z.string().min(1, "Target admin user is required"),
  adminPass: z.string().min(1, "Target admin password is required"),
});

// export: source (full) only
const ExportConfigSchema = z.object({
  source: AuthSourceSchema,
  configCliImage: z.string().optional(),
});

// import: source.realm to locate the file + target (empty strings treated as not configured)
const ImportConfigSchema = z.object({
  source: z.object({
    realm: z.string().min(1, "source.realm is required to locate the realm file"),
  }),
  target: z.object({
    url: z.string(),
    adminUser: z.string(),
    adminPass: z.string(),
  }).optional(),
  configCliImage: z.string().optional(),
});

// sync: full source + full target
const SyncConfigSchema = z.object({
  source: AuthSourceSchema,
  target: AuthTargetSchema,
  configCliImage: z.string().optional(),
});

// ============================================
// Error Formatting
// ============================================

function formatZodErrors(error: z.ZodError): string {
  const lines = ["Invalid auth configuration:"];
  for (const issue of error.issues) {
    const p = issue.path.join(".");
    lines.push(`  • ${p}: ${issue.message}`);
  }
  return lines.join("\n");
}

// ============================================
// Config Loaders
// ============================================

const DEFAULT_CONFIG_CLI_IMAGE = "adorsys/keycloak-config-cli:latest-26";

/** Used by `auth export` — only source is required. */
export function getExportConfig(): AuthConfig {
  const config = loadPostkitConfig();
  const result = ExportConfigSchema.safeParse(config.auth);
  if (!result.success) throw new Error(formatZodErrors(result.error));

  const auth = result.data;
  const authDir = getPostkitAuthDir();
  const outputFilename = `${auth.source.realm}.json`;

  return {
    sourceUrl: auth.source.url,
    sourceAdminUser: auth.source.adminUser,
    sourceAdminPass: auth.source.adminPass,
    sourceRealm: auth.source.realm,
    targetUrl: "",
    targetAdminUser: "",
    targetAdminPass: "",
    configCliImage: auth.configCliImage ?? DEFAULT_CONFIG_CLI_IMAGE,
    rawFilePath: path.join(authDir, "raw", outputFilename),
    cleanFilePath: path.join(authDir, "realm", outputFilename),
  };
}

/** Used by `auth import` — source.realm + target required (must be explicitly configured). */
export function getImportConfig(): AuthConfig {
  const config = loadPostkitConfig();
  const result = ImportConfigSchema.safeParse(config.auth);
  if (!result.success) throw new Error(formatZodErrors(result.error));

  const auth = result.data;
  const t = auth.target;

  if (!t?.url?.trim() || !t?.adminUser?.trim() || !t?.adminPass?.trim()) {
    throw new Error(
      "Target Keycloak not configured.\n" +
      "Add auth.target.url, auth.target.adminUser, and auth.target.adminPass to postkit.secrets.json.",
    );
  }

  const authDir = getPostkitAuthDir();
  const outputFilename = `${auth.source.realm}.json`;

  return {
    sourceUrl: "",
    sourceAdminUser: "",
    sourceAdminPass: "",
    sourceRealm: auth.source.realm,
    targetUrl: t.url,
    targetAdminUser: t.adminUser,
    targetAdminPass: t.adminPass,
    configCliImage: auth.configCliImage ?? DEFAULT_CONFIG_CLI_IMAGE,
    rawFilePath: path.join(authDir, "raw", outputFilename),
    cleanFilePath: path.join(authDir, "realm", outputFilename),
  };
}

/** Used by `auth sync` — both source and target required. */
export function getAuthConfig(): AuthConfig {
  const config = loadPostkitConfig();
  const result = SyncConfigSchema.safeParse(config.auth);
  if (!result.success) throw new Error(formatZodErrors(result.error));

  const auth = result.data;
  const authDir = getPostkitAuthDir();
  const outputFilename = `${auth.source.realm}.json`;

  return {
    sourceUrl: auth.source.url,
    sourceAdminUser: auth.source.adminUser,
    sourceAdminPass: auth.source.adminPass,
    sourceRealm: auth.source.realm,
    targetUrl: auth.target.url,
    targetAdminUser: auth.target.adminUser,
    targetAdminPass: auth.target.adminPass,
    configCliImage: auth.configCliImage ?? DEFAULT_CONFIG_CLI_IMAGE,
    rawFilePath: path.join(authDir, "raw", outputFilename),
    cleanFilePath: path.join(authDir, "realm", outputFilename),
  };
}
