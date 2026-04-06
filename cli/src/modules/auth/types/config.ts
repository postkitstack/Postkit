/**
 * Auth configuration types
 */

// ============================================
// Input Config Types (from postkit.config.json)
// ============================================

export interface AuthSourceInputConfig {
  url: string;
  adminUser: string;
  adminPass: string;
  realm: string;
}

export interface AuthTargetInputConfig {
  url: string;
  adminUser: string;
  adminPass: string;
}

export interface AuthInputConfig {
  source: AuthSourceInputConfig;
  target: AuthTargetInputConfig;
  configCliImage?: string;
}

// ============================================
// Runtime Config Types (resolved paths)
// ============================================

export interface AuthConfig {
  // Source Keycloak (export from)
  sourceUrl: string;
  sourceAdminUser: string;
  sourceAdminPass: string;
  sourceRealm: string;

  // Target Keycloak (import to)
  targetUrl: string;
  targetAdminUser: string;
  targetAdminPass: string;

  // Docker image
  configCliImage: string;

  // Resolved paths
  rawFilePath: string;
  cleanFilePath: string;
}
