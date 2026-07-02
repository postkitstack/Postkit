import fs from "fs";
import path from "path";
import {mkdtemp, writeFile, rm} from "fs/promises";
import {tmpdir} from "os";
import type {Ora} from "ora";
import {projectRoot} from "../../../common/config";
import {runSpawnCommand} from "../../../common/shell";
import type {StackConfig} from "../types/config";
const CONFIG_CLI_IMAGE = "adorsys/keycloak-config-cli:latest-26";

// ============================================
// Built-in Keycloak clients — never import these
// ============================================

const BUILTIN_CLIENTS = new Set([
  "account",
  "account-console",
  "admin-cli",
  "broker",
  "realm-management",
  "security-admin-console",
]);

// ============================================
// PostKit default protocol mapper — injected into every non-builtin client
// ============================================

const JWT_ROLE_MAPPER = {
  name: "JWT Role Mapper",
  protocol: "openid-connect",
  protocolMapper: "script-primary-role.js",
  consentRequired: false,
  config: {},
};

// ============================================
// Types
// ============================================

interface RealmRole {
  id?: string;
  name?: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RealmClient {
  id?: string;
  clientId?: string;
  secret?: string;
  registrationAccessToken?: string;
  attributes?: Record<string, unknown>;
  serviceAccountRealmRoles?: string[];
  [key: string]: unknown;
}

// ============================================
// Realm Template Cleaner
// ============================================

export function cleanRealmTemplate(
  raw: Record<string, unknown>,
  realmName: string,
): Record<string, unknown> {
  // Deep clone to avoid mutating the original
  const cleaned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  // Set realm name and remove id
  cleaned.realm = realmName;
  delete cleaned.id;

  // Filter and clean clients
  if (Array.isArray(cleaned.clients)) {
    const filteredClients = (cleaned.clients as RealmClient[])
      .filter((client) => {
        const clientId = client.clientId as string | undefined;
        return clientId !== undefined && !BUILTIN_CLIENTS.has(clientId);
      })
      .map((client) => {
        // Strip sensitive/generated fields
        delete client.id;
        delete client.secret;
        delete client.registrationAccessToken;
        if (client.attributes) {
          delete client.attributes["client.secret.creation.time"];
        }

        // Set service account realm roles for known clients
        const clientId = client.clientId as string | undefined;
        if (clientId === "supabase_service") {
          client.serviceAccountRealmRoles = ["service_role", "app_user"];
        } else if (clientId === "anon") {
          client.serviceAccountRealmRoles = ["anon"];
        }

        // Inject JWT Role Mapper if not already present
        const mappers = (client.protocolMappers ?? []) as Array<Record<string, unknown>>;
        const hasJwtMapper = mappers.some((m) => m.name === JWT_ROLE_MAPPER.name);
        if (!hasJwtMapper) {
          client.protocolMappers = [...mappers, JWT_ROLE_MAPPER];
        }

        return client;
      });

    cleaned.clients = filteredClients;
  }

  // Ensure admin role exists in realm roles and strip ids
  const roles = (cleaned.roles ?? {}) as Record<string, unknown>;
  cleaned.roles = roles;

  if (!Array.isArray(roles.realm)) {
    roles.realm = [];
  }

  const realmRoles = roles.realm as RealmRole[];

  const hasAdminRole = realmRoles.some((r) => r.name === "admin");
  if (!hasAdminRole) {
    realmRoles.push({
      name: "admin",
      description: "Administrator role",
      composite: false,
      clientRole: false,
      attributes: {},
    });
  }

  // Strip id from every realm role
  roles.realm = realmRoles.map((role) => {
    const cleaned = {...role};
    delete cleaned.id;
    return cleaned;
  });

  // Remove built-in client keys from roles.client
  if (roles.client && typeof roles.client === "object" && !Array.isArray(roles.client)) {
    const clientRoles = roles.client as Record<string, unknown>;
    for (const builtinKey of BUILTIN_CLIENTS) {
      delete clientRoles[builtinKey];
    }
  }

  return cleaned;
}

// ============================================
// Main Import Function
// ============================================

export async function importRealmTemplate(
  config: StackConfig,
  spinner?: Ora,
): Promise<void> {
  if (!config.keycloak.realmTemplate) {
    return;
  }

  const templatePath = path.resolve(projectRoot, config.keycloak.realmTemplate);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Realm template not found: ${templatePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(templatePath, "utf-8")) as Record<string, unknown>;
  const cleaned = cleanRealmTemplate(raw, config.keycloak.realm);

  const tmpDir = await mkdtemp(path.join(tmpdir(), "postkit-realm-"));

  try {
    // Write cleaned realm JSON to temp file
    const cleanedRealmFile = path.join(tmpDir, "realm.json");
    await writeFile(cleanedRealmFile, JSON.stringify(cleaned, null, 2), {mode: 0o600});

    // Use internal Docker DNS name — keycloak-config-cli runs inside Docker,
    // so it must reach Keycloak via the container network, not the Traefik hostname.
    const internalKeycloakUrl = `http://keycloak:8080`;

    // Write env file
    const envFile = path.join(tmpDir, "realm-import.env");
    const envContent = [
      `KEYCLOAK_URL=${internalKeycloakUrl}/`,
      `KEYCLOAK_USER=${config.keycloak.adminUser}`,
      `KEYCLOAK_PASSWORD=${config.keycloak.adminPassword}`,
      "KEYCLOAK_AVAILABILITYCHECK_ENABLED=true",
      "KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s",
      "IMPORT_FILES_LOCATIONS=/config/realm.json",
    ].join("\n");

    await writeFile(envFile, envContent, {mode: 0o600});

    if (spinner) {
      spinner.text = `Importing realm "${config.keycloak.realm}" into Keycloak...`;
    }

    const result = await runSpawnCommand([
      "docker", "run", "--rm",
      "--network", config.network,
      "--env-file", envFile,
      "-v", `${cleanedRealmFile}:/config/realm.json`,
      CONFIG_CLI_IMAGE,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(
        `keycloak-config-cli import failed:\n${result.stderr || result.stdout}`,
      );
    }
  } finally {
    await rm(tmpDir, {recursive: true, force: true});
  }
}
