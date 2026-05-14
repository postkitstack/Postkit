import http from "http";
import fs from "fs";
import type {Ora} from "ora";
import {getSecretsFilePath} from "../../../common/config";
import type {StackConfig, StackJwkKey, StackJwksSecrets, StackClientSecrets} from "../types/config";

// ============================================
// Public Result Types
// ============================================

export interface KeysResult {
  jwks: StackJwksSecrets;
  jwk: StackJwkKey;
  clients: Record<string, StackClientSecrets>;
}

// ============================================
// URL Helpers
// ============================================

/**
 * Returns the Keycloak URL via Traefik.
 * Uses http://keycloak.localhost if httpPort is 80, otherwise includes the port.
 */
export function getKeycloakUrl(config: StackConfig): string {
  if (config.traefik.httpPort === 80) {
    return "http://keycloak.localhost";
  }
  return `http://keycloak.localhost:${config.traefik.httpPort}`;
}

// ============================================
// HTTP Helpers (Node built-in only)
// ============================================

/**
 * Perform an HTTP GET request. Returns the response body string.
 * Throws on non-2xx status codes.
 */
function httpGet(url: string, bearerToken?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`;
    }

    const req = http.get(url, {headers, timeout: 15000}, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) {
          resolve(body);
        } else {
          reject(new Error(`GET ${url} returned ${status}: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`GET ${url} timed out`));
    });
  });
}

/**
 * Perform an HTTP POST request. Returns the response body string.
 * Throws on non-2xx status codes.
 */
function httpPost(
  url: string,
  body: string,
  contentType = "application/x-www-form-urlencoded",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options: http.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 15000,
    };

    const req = http.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk: Buffer) => { responseBody += chunk.toString(); });
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) {
          resolve(responseBody);
        } else {
          reject(new Error(`POST ${url} returned ${status}: ${responseBody.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`POST ${url} timed out`));
    });

    req.write(body);
    req.end();
  });
}

// ============================================
// Keycloak API Calls
// ============================================

/**
 * Fetch the JWKS from Keycloak's OIDC endpoint for the given realm.
 */
export async function fetchKeycloakJwks(
  keycloakUrl: string,
  realm: string,
): Promise<StackJwkKey[]> {
  const url = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`;
  const body = await httpGet(url);
  const parsed = JSON.parse(body) as {keys: StackJwkKey[]};
  return parsed.keys ?? [];
}

/**
 * Extract the primary RSA signing key from a JWKS key list.
 * Returns only the fields needed for JWT verification.
 */
export function extractRsaKey(keys: StackJwkKey[]): StackJwkKey | undefined {
  const rsaKey = keys.find(
    (k) => k.kty === "RSA" && (k.use === "sig" || k.use === undefined),
  );
  if (!rsaKey) return undefined;

  return {
    kid: rsaKey.kid,
    kty: "RSA",
    alg: "RS256",
    use: "sig",
    key_ops: ["verify"],
    n: rsaKey.n,
    e: rsaKey.e,
  };
}

/**
 * Obtain a Keycloak admin access token from the master realm.
 */
export async function getAdminToken(
  keycloakUrl: string,
  adminUser: string,
  adminPassword: string,
): Promise<string> {
  const url = `${keycloakUrl}/realms/master/protocol/openid-connect/token`;
  const body = [
    `username=${encodeURIComponent(adminUser)}`,
    `password=${encodeURIComponent(adminPassword)}`,
    "grant_type=password",
    "client_id=admin-cli",
  ].join("&");

  const responseBody = await httpPost(url, body);
  const parsed = JSON.parse(responseBody) as {access_token: string};
  return parsed.access_token;
}

/**
 * Fetch credentials for a single Keycloak client.
 * Returns the client secret and a client-credentials access token.
 */
export async function fetchClientCredentials(
  keycloakUrl: string,
  clientRealm: string,
  clientName: string,
  adminToken: string,
): Promise<StackClientSecrets> {
  // Step 1: Look up the client's internal UUID
  const listUrl = `${keycloakUrl}/admin/realms/${clientRealm}/clients?clientId=${encodeURIComponent(clientName)}`;
  const listBody = await httpGet(listUrl, adminToken);
  const clients = JSON.parse(listBody) as Array<{id: string}>;
  if (!clients || clients.length === 0 || !clients[0]) {
    throw new Error(`Keycloak client "${clientName}" not found in realm "${clientRealm}"`);
  }
  const uuid = clients[0].id;

  // Step 2: Fetch the client secret
  const secretUrl = `${keycloakUrl}/admin/realms/${clientRealm}/clients/${uuid}/client-secret`;
  const secretBody = await httpGet(secretUrl, adminToken);
  const secretParsed = JSON.parse(secretBody) as {value: string};
  const secret = secretParsed.value;

  // Step 3: Exchange client credentials for an access token
  const tokenUrl = `${keycloakUrl}/realms/${clientRealm}/protocol/openid-connect/token`;
  const tokenBody = [
    `client_id=${encodeURIComponent(clientName)}`,
    `client_secret=${encodeURIComponent(secret)}`,
    "grant_type=client_credentials",
  ].join("&");

  const tokenResponse = await httpPost(tokenUrl, tokenBody);
  const tokenParsed = JSON.parse(tokenResponse) as {access_token: string};
  const token = tokenParsed.access_token;

  return {secret, token};
}

// ============================================
// Main Fetch Orchestration
// ============================================

/**
 * Fetch JWKs and client credentials from a running Keycloak and merge them
 * with the existing oct signing key.
 */
export async function fetchAndMergeKeys(
  config: StackConfig,
  spinner?: Ora,
): Promise<KeysResult> {
  const keycloakUrl = getKeycloakUrl(config);

  // Fetch OIDC JWKs
  if (spinner) spinner.text = "Fetching JWKs from Keycloak...";
  const oidcKeys = await fetchKeycloakJwks(keycloakUrl, config.keycloak.realm);

  // Extract RSA signing key
  const jwk = extractRsaKey(oidcKeys);
  if (!jwk) {
    throw new Error(
      `No RSA signing key found in Keycloak realm "${config.keycloak.realm}". ` +
      "Ensure the realm is configured and Keycloak is fully initialised.",
    );
  }

  // Preserve the existing oct URL-signing key
  const existingOctKey = config.jwks.urlSigningKey;

  // Build merged JWKS: RSA keys from Keycloak + existing oct key
  const mergedKeys: StackJwkKey[] = [...oidcKeys];
  if (existingOctKey) {
    mergedKeys.push(existingOctKey);
  }

  const jwks: StackJwksSecrets = {
    keys: mergedKeys,
    ...(existingOctKey ? {urlSigningKey: existingOctKey} : {}),
  };

  // Fetch admin token
  if (spinner) spinner.text = "Getting admin token...";
  const adminToken = await getAdminToken(
    keycloakUrl,
    config.keycloak.adminUser,
    config.keycloak.adminPassword,
  );

  // Fetch credentials for each configured client
  const clients: Record<string, StackClientSecrets> = {};
  for (const clientName of config.keycloakClients) {
    if (spinner) spinner.text = `Fetching credentials for client "${clientName}"...`;
    clients[clientName] = await fetchClientCredentials(
      keycloakUrl,
      config.keycloak.clientRealm,
      clientName,
      adminToken,
    );
  }

  return {jwks, jwk, clients};
}

// ============================================
// Secrets Writer
// ============================================

/**
 * Write the fetched keys/clients back to postkit.secrets.json.
 */
export function writeKeysToSecrets(result: KeysResult): void {
  const secretsPath = getSecretsFilePath();
  const secrets: Record<string, unknown> = fs.existsSync(secretsPath)
    ? (JSON.parse(fs.readFileSync(secretsPath, "utf-8")) as Record<string, unknown>)
    : {};

  if (!secrets.stack) {
    secrets.stack = {};
  }
  const ss = secrets.stack as Record<string, unknown>;
  ss.jwks = result.jwks;
  ss.jwk = result.jwk;
  ss.clients = result.clients;

  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2) + "\n", "utf-8");
}
