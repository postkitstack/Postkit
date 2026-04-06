import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import type {AuthConfig} from "../types/config";
import type {
  KeycloakClient,
  KeycloakComponents,
  KeycloakIdentityProvider,
  KeycloakRealm,
} from "../types/keycloak";

// Re-export types for convenience
export type {
  KeycloakClient,
  KeycloakComponents,
  KeycloakIdentityProvider,
  KeycloakRealm,
} from "../types/keycloak";

// ============================================
// Token acquisition
// ============================================

export async function getAdminToken(
  url: string,
  user: string,
  pass: string,
): Promise<string> {
  const tokenUrl = `${url}/realms/master/protocol/openid-connect/token`;

  const body = new URLSearchParams({
    client_id: "admin-cli",
    username: user,
    password: pass,
    grant_type: "password",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to acquire admin token (${response.status}): ${text}`,
    );
  }

  const data = (await response.json()) as {access_token?: string};

  if (!data.access_token) {
    throw new Error("Token response missing access_token field");
  }

  return data.access_token;
}

// ============================================
// Realm export
// ============================================

export async function exportRealm(
  url: string,
  realm: string,
  token: string,
): Promise<KeycloakRealm> {
  const exportUrl = `${url}/admin/realms/${realm}/partial-export?exportClients=true&exportGroupsAndRoles=true`;

  const response = await fetch(exportUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Realm export failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  if (!data || data === "null") {
    throw new Error("Export returned empty response");
  }

  return data as KeycloakRealm;
}

// ============================================
// Clean realm config (replaces Python script)
// ============================================

function stripIds(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => stripIds(item));
  }
  if (obj !== null && typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      if (key !== "id" && key !== "_id") {
        result[key] = stripIds(record[key]);
      }
    }
    return result;
  }
  return obj;
}

function stripContainerIds(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => stripContainerIds(item));
  }
  if (obj !== null && typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      if (key !== "containerId") {
        result[key] = stripContainerIds(record[key]);
      }
    }
    return result;
  }
  return obj;
}

export function cleanRealmConfig(realm: KeycloakRealm): KeycloakRealm {
  // Deep clone to avoid mutating the original export
  const cleaned = JSON.parse(JSON.stringify(realm)) as KeycloakRealm;

  // Remove users
  delete cleaned.users;

  // Remove client secrets
  if (Array.isArray(cleaned.clients)) {
    for (const client of cleaned.clients) {
      delete client.secret;
    }
  }

  // Remove key providers and storage provider credentials from components
  if (cleaned.components) {
    delete cleaned.components["org.keycloak.keys.KeyProvider"];

    if (Array.isArray(cleaned.components["org.keycloak.storage.UserStorageProvider"])) {
      for (const provider of cleaned.components["org.keycloak.storage.UserStorageProvider"]) {
        if (provider.config) {
          delete provider.config.bindCredential;
        }
      }
    }
  }

  // Remove SMTP password
  if (cleaned.smtpServer) {
    delete cleaned.smtpServer.password;
  }

  // Remove identity provider client secrets
  if (Array.isArray(cleaned.identityProviders)) {
    for (const idp of cleaned.identityProviders) {
      if (idp.config) {
        delete idp.config.clientSecret;
      }
    }
  }

  // Remove default role ID
  if (cleaned.defaultRole) {
    delete cleaned.defaultRole.id;
  }

  // Strip all IDs and container IDs (pure — return new objects)
  return stripContainerIds(stripIds(cleaned)) as KeycloakRealm;
}

// ============================================
// File I/O
// ============================================

export async function saveRawExport(
  data: KeycloakRealm,
  filePath: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, {recursive: true});
  }
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function loadCleanExport(filePath: string): Promise<KeycloakRealm> {
  if (!existsSync(filePath)) {
    throw new Error(`Cleaned config not found: ${filePath}`);
  }
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as KeycloakRealm;
}
