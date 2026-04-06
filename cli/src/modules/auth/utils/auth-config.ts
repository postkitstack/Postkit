import path from "path";
import {z} from "zod";
import {getPostkitAuthDir, loadPostkitConfig} from "../../../common/config";

// Zod schemas for validation
const AuthSourceSchema = z.object({
  url: z.url("Source URL must be a valid URL"),
  adminUser: z.string().min(1, "Source admin user is required"),
  adminPass: z.string().min(1, "Source admin password is required"),
  realm: z.string().min(1, "Source realm is required"),
});

const AuthTargetSchema = z.object({
  url: z.url("Target URL must be a valid URL"),
  adminUser: z.string().min(1, "Target admin user is required"),
  adminPass: z.string().min(1, "Target admin password is required"),
});

const AuthConfigSchema = z.object({
  source: AuthSourceSchema,
  target: AuthTargetSchema,
  configCliImage: z.string().optional(),
});

// Inferred type from schema
export type AuthConfig = z.infer<typeof AuthConfigSchema> & {
  // Resolved paths (added at runtime)
  rawFilePath: string;
  cleanFilePath: string;
};

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

export function getAuthConfig(): AuthConfig {
  const config = loadPostkitConfig();

  // Validate with Zod
  const result = AuthConfigSchema.safeParse(config.auth);

  if (!result.success) {
    throw new Error(formatZodErrors(result.error));
  }

  const auth = result.data;

  // Use .postkit/auth/ as default locations with realm name as filename
  const authDir = getPostkitAuthDir();
  const outputFilename = `${auth.source.realm}.json`;
  const configCliImage =
    auth.configCliImage || "adorsys/keycloak-config-cli:6.4.0-24";

  return {
    ...auth,
    configCliImage,
    rawFilePath: path.join(authDir, "raw", outputFilename),
    cleanFilePath: path.join(authDir, "realm", outputFilename),
  };
}
