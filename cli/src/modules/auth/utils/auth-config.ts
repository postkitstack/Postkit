import path from "path";
import {projectRoot, loadPostkitConfig} from "../../../common/config";

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
  const config = loadPostkitConfig();

  const sourceUrl = config.auth.source.url;
  const sourceAdminUser = config.auth.source.adminUser;
  const sourceAdminPass = config.auth.source.adminPass;
  const sourceRealm = config.auth.source.realm;

  if (!sourceUrl || !sourceAdminUser || !sourceAdminPass || !sourceRealm) {
    throw new Error(
      "Missing source Keycloak config. Set auth.source.url, auth.source.adminUser, auth.source.adminPass, auth.source.realm in postkit.config.json",
    );
  }

  const targetUrl = config.auth.target.url;
  const targetAdminUser = config.auth.target.adminUser;
  const targetAdminPass = config.auth.target.adminPass;

  if (!targetUrl || !targetAdminUser || !targetAdminPass) {
    throw new Error(
      "Missing target Keycloak config. Set auth.target.url, auth.target.adminUser, auth.target.adminPass in postkit.config.json",
    );
  }

  const rawExportDir = config.auth.rawExportDir || ".tmp-config";
  const cleanOutputDir = config.auth.cleanOutputDir || "realm-config";
  const outputFilename =
    config.auth.outputFilename || "pro-application-realm.json";
  const configCliImage =
    config.auth.configCliImage || "adorsys/keycloak-config-cli:6.4.0-24";

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
