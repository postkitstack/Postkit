import path from "path";
import {cliRoot, projectRoot} from "../../../common/config";

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

  // Directories
  rawExportDir: string;
  cleanOutputDir: string;
  outputFilename: string;

  // Docker image
  configCliImage: string;

  // Resolved paths
  rawFilePath: string;
  cleanFilePath: string;
}

export function getAuthConfig(): AuthConfig {
  const sourceUrl = process.env.KC_SOURCE_URL;
  const sourceAdminUser = process.env.KC_SOURCE_ADMIN_USER;
  const sourceAdminPass = process.env.KC_SOURCE_ADMIN_PASS;
  const sourceRealm = process.env.KC_SOURCE_REALM;

  if (!sourceUrl || !sourceAdminUser || !sourceAdminPass || !sourceRealm) {
    throw new Error(
      "Missing source Keycloak config. Set KC_SOURCE_URL, KC_SOURCE_ADMIN_USER, KC_SOURCE_ADMIN_PASS, KC_SOURCE_REALM in .env",
    );
  }

  const targetUrl = process.env.KC_TARGET_URL;
  const targetAdminUser = process.env.KC_TARGET_ADMIN_USER;
  const targetAdminPass = process.env.KC_TARGET_ADMIN_PASS;

  if (!targetUrl || !targetAdminUser || !targetAdminPass) {
    throw new Error(
      "Missing target Keycloak config. Set KC_TARGET_URL, KC_TARGET_ADMIN_USER, KC_TARGET_ADMIN_PASS in .env",
    );
  }

  const rawExportDir = process.env.RAW_EXPORT_DIR || ".tmp-config";
  const cleanOutputDir = process.env.CLEAN_OUTPUT_DIR || "realm-config";
  const outputFilename =
    process.env.OUTPUT_FILENAME || "pro-application-realm.json";
  const configCliImage =
    process.env.KC_CONFIG_CLI_IMAGE || "adorsys/keycloak-config-cli:6.4.0-24";

  // Resolve paths relative to project root
  const rawDir = path.resolve(projectRoot, rawExportDir);
  const cleanDir = path.resolve(projectRoot, cleanOutputDir);

  return {
    sourceUrl,
    sourceAdminUser,
    sourceAdminPass,
    sourceRealm,
    targetUrl,
    targetAdminUser,
    targetAdminPass,
    rawExportDir,
    cleanOutputDir,
    outputFilename,
    configCliImage,
    rawFilePath: path.join(rawDir, outputFilename),
    cleanFilePath: path.join(cleanDir, outputFilename),
  };
}
