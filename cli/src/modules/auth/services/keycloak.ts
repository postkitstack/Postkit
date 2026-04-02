import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import type {AuthConfig} from "../utils/auth-config";

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
): Promise<Record<string, unknown>> {
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

  return data as Record<string, unknown>;
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
    delete record["id"];
    delete record["_id"];
    for (const key of Object.keys(record)) {
      record[key] = stripIds(record[key]);
    }
    return record;
  }
  return obj;
}

function stripContainerIds(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => stripContainerIds(item));
  }
  if (obj !== null && typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    delete record["containerId"];
    for (const key of Object.keys(record)) {
      record[key] = stripContainerIds(record[key]);
    }
    return record;
  }
  return obj;
}

export function cleanRealmConfig(
  realm: Record<string, unknown>,
): Record<string, unknown> {
  // Deep clone to avoid mutating original
  const cleaned = JSON.parse(JSON.stringify(realm)) as Record<string, unknown>;

  // Remove users
  delete cleaned["users"];

  // Remove client secrets
  const clients = cleaned["clients"] as
    | Array<Record<string, unknown>>
    | undefined;
  if (Array.isArray(clients)) {
    for (const client of clients) {
      delete client["secret"];
    }
  }

  // Remove key providers from components
  const components = cleaned["components"] as
    | Record<string, unknown>
    | undefined;
  if (components && typeof components === "object") {
    delete components["org.keycloak.keys.KeyProvider"];

    // Remove storage provider credentials
    const storageProviders = components[
      "org.keycloak.storage.UserStorageProvider"
    ] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(storageProviders)) {
      for (const provider of storageProviders) {
        const cfg = provider["config"] as Record<string, unknown> | undefined;
        if (cfg && typeof cfg === "object") {
          delete cfg["bindCredential"];
        }
      }
    }
  }

  // Remove SMTP password
  const smtpServer = cleaned["smtpServer"] as
    | Record<string, unknown>
    | undefined;
  if (smtpServer && typeof smtpServer === "object") {
    delete smtpServer["password"];
  }

  // Remove identity provider client secrets
  const identityProviders = cleaned["identityProviders"] as
    | Array<Record<string, unknown>>
    | undefined;
  if (Array.isArray(identityProviders)) {
    for (const idp of identityProviders) {
      const cfg = idp["config"] as Record<string, unknown> | undefined;
      if (cfg && typeof cfg === "object") {
        delete cfg["clientSecret"];
      }
    }
  }

  // Remove default role ID
  const defaultRole = cleaned["defaultRole"] as
    | Record<string, unknown>
    | undefined;
  if (defaultRole && typeof defaultRole === "object") {
    delete defaultRole["id"];
  }

  // Strip all IDs and container IDs
  stripIds(cleaned);
  stripContainerIds(cleaned);

  return cleaned;
}

// ============================================
// File I/O
// ============================================

export async function saveRawExport(
  data: Record<string, unknown>,
  filePath: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, {recursive: true});
  }
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function loadCleanExport(
  filePath: string,
): Promise<Record<string, unknown>> {
  if (!existsSync(filePath)) {
    throw new Error(`Cleaned config not found: ${filePath}`);
  }
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as Record<string, unknown>;
}
