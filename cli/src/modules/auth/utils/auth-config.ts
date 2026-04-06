import path from "path";
import {z} from "zod";
import {getPostkitAuthDir, loadPostkitConfig} from "../../../common/config";
import type {AuthConfig} from "../types/config";

// Re-export types for convenience
export type {AuthConfig, AuthInputConfig} from "../types/config";

// ============================================
// Zod Schemas for Validation
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

const AuthConfigInputSchema = z.object({
  source: AuthSourceSchema,
  target: AuthTargetSchema,
  configCliImage: z.string().optional(),
});

// ============================================
// Error Formatting
// ============================================

/**
 * Format Zod validation errors into user-friendly messages
 */
function formatZodErrors(error: z.ZodError): string {
  const lines = ["Invalid auth configuration:"];
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
 * Get validated auth configuration
 * @throws Error if configuration is invalid
 */
export function getAuthConfig(): AuthConfig {
  const config = loadPostkitConfig();

  // Validate with Zod
  const result = AuthConfigInputSchema.safeParse(config.auth);

  if (!result.success) {
    throw new Error(formatZodErrors(result.error));
  }

  const auth = result.data;

  // Use .postkit/auth/ as default locations with realm name as filename
  const authDir = getPostkitAuthDir();
  const outputFilename = `${auth.source.realm}.json`;
  const configCliImage =
    auth.configCliImage || "adorsys/keycloak-config-cli:6.4.0-24";

  // Return flattened structure for easier use in commands
  return {
    sourceUrl: auth.source.url,
    sourceAdminUser: auth.source.adminUser,
    sourceAdminPass: auth.source.adminPass,
    sourceRealm: auth.source.realm,
    targetUrl: auth.target.url,
    targetAdminUser: auth.target.adminUser,
    targetAdminPass: auth.target.adminPass,
    configCliImage,
    rawFilePath: path.join(authDir, "raw", outputFilename),
    cleanFilePath: path.join(authDir, "realm", outputFilename),
  };
}
