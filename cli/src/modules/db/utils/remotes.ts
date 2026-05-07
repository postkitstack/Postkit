import fs from "fs/promises";
import {existsSync} from "fs";
import {logger} from "../../../common/logger";
import {loadPostkitConfig, getConfigFilePath, getSecretsFilePath, invalidateConfig} from "../../../common/config";
import type {RemoteConfig} from "../../../common/config";

export interface RemoteInfo {
  name: string;
  url: string;
  isDefault: boolean;
  addedAt?: string;
}

/**
 * Get all configured remotes from the merged config
 * @throws Error if no remotes are configured
 */
export function getRemotes(): Record<string, RemoteConfig> {
  const config = loadPostkitConfig();

  if (!config.db.remotes || Object.keys(config.db.remotes).length === 0) {
    throw new Error(
      "No remotes configured. Add a remote with:\n" +
      '  postkit db remote add <name> <url>\n\n' +
      "Or run postkit init to set up your project.",
    );
  }

  return config.db.remotes;
}

/**
 * Get a list of all remotes with their info
 */
export function getRemoteList(): RemoteInfo[] {
  const remotes = getRemotes();

  return Object.entries(remotes).map(([name, config]) => ({
    name,
    url: config.url,
    isDefault: config.default === true,
    addedAt: config.addedAt,
  }));
}

/**
 * Get a specific remote by name
 * @returns Remote config or null if not found
 */
export function getRemote(name: string): RemoteConfig | null {
  const remotes = getRemotes();
  return remotes[name] || null;
}

/**
 * Get the name of the default remote
 * @returns Default remote name or null if none is set
 * @throws Error if no remotes are configured
 */
export function getDefaultRemote(): string | null {
  const remotes = getRemotes();
  const defaultName = Object.keys(remotes).find(name => remotes[name]?.default === true);

  if (!defaultName) {
    const firstRemote = Object.keys(remotes)[0];
    if (firstRemote) {
      return firstRemote;
    }
    return null;
  }

  return defaultName;
}

// ─── File read helpers ───────────────────────────────────────────────────────

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function writeJsonFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Returns true when the project was initialized with the split-config layout
 * (i.e. postkit.secrets.json exists next to postkit.config.json).
 */
function hasSplitConfig(): boolean {
  return existsSync(getSecretsFilePath());
}

// ─── Remote management ───────────────────────────────────────────────────────

/**
 * Add a new remote configuration.
 *
 * Split-config projects: metadata (default, addedAt) → postkit.config.json
 *                        URL → postkit.secrets.json
 * Legacy projects (no secrets file): everything → postkit.config.json
 */
export async function addRemote(name: string, url: string, setAsDefault: boolean = false): Promise<void> {
  // Validate name — only letters, numbers, hyphens, underscores
  if (!name || name.trim().length === 0) {
    throw new Error("Remote name cannot be empty");
  }

  if (!isValidRemoteName(name)) {
    throw new Error(
      `Invalid remote name "${name}". Use only letters, numbers, hyphens (-), and underscores (_).`,
    );
  }

  if (!isValidDatabaseUrl(url)) {
    throw new Error(
      "Invalid database URL format. Expected format: postgres://user:pass@host:port/database",
    );
  }

  const configPath = getConfigFilePath();
  const config = await readJsonFile(configPath);
  const db = (config.db ?? {}) as Record<string, unknown>;
  const existingRemotes = (db.remotes ?? {}) as Record<string, Record<string, unknown>>;

  if (existingRemotes[name]) {
    throw new Error(`Remote "${name}" already exists`);
  }

  // Check for URL conflicts in the merged (runtime) config
  const merged = loadPostkitConfig();
  if (merged.db.localDbUrl && normalizeUrl(url) === normalizeUrl(merged.db.localDbUrl)) {
    throw new Error(
      "Cannot add remote: URL matches local database URL.\n" +
      "The remote URL must be different from your local database."
    );
  }

  const existingByUrl = findRemoteByUrl(merged.db.remotes, url);
  if (existingByUrl) {
    throw new Error(
      `Cannot add remote: URL already used by remote "${existingByUrl}".\n` +
      "Each remote must have a unique URL."
    );
  }

  const remoteCount = Object.keys(existingRemotes).length;
  const makeDefault = setAsDefault || remoteCount === 0;

  if (makeDefault) {
    for (const key of Object.keys(existingRemotes)) {
      delete existingRemotes[key].default;
    }
  }

  const addedAt = new Date().toISOString();

  if (hasSplitConfig()) {
    // Write metadata to public config
    existingRemotes[name] = {addedAt};
    if (makeDefault) existingRemotes[name].default = true;
    db.remotes = existingRemotes;
    config.db = db;
    await writeJsonFile(configPath, config);

    // Write URL to secrets
    const secretsPath = getSecretsFilePath();
    const secrets = await readJsonFile(secretsPath);
    const secretsDb = (secrets.db ?? {}) as Record<string, unknown>;
    const secretsRemotes = (secretsDb.remotes ?? {}) as Record<string, unknown>;
    secretsRemotes[name] = {url};
    secretsDb.remotes = secretsRemotes;
    secrets.db = secretsDb;
    await writeJsonFile(secretsPath, secrets);
  } else {
    // Legacy: write everything to postkit.config.json
    existingRemotes[name] = {url, addedAt};
    if (makeDefault) existingRemotes[name].default = true;
    db.remotes = existingRemotes;
    config.db = db;
    await writeJsonFile(configPath, config);
  }

  invalidateConfig();
  logger.success(`Remote "${name}" added successfully`);
}

/**
 * Remove a remote configuration from both config and secrets files.
 */
export async function removeRemote(name: string, force: boolean = false): Promise<void> {
  // Use merged config to validate existence and count
  const merged = loadPostkitConfig();
  const remotes = merged.db.remotes ?? {};

  if (!remotes[name]) {
    throw new Error(`Remote "${name}" not found`);
  }

  const remoteCount = Object.keys(remotes).length;

  if (remoteCount === 1) {
    throw new Error(
      "Cannot remove the only remaining remote. Add another remote first.",
    );
  }

  const isDefault = remotes[name].default === true;

  if (isDefault && !force) {
    throw new Error(
      `Cannot remove default remote "${name}". Set another remote as default first:\n` +
      `  postkit db remote use <name>\n\n` +
      "Or use --force to remove anyway (another remote will become default).",
    );
  }

  // Remove from public config
  const configPath = getConfigFilePath();
  const config = await readJsonFile(configPath);
  const db = (config.db ?? {}) as Record<string, unknown>;
  const configRemotes = (db.remotes ?? {}) as Record<string, Record<string, unknown>>;
  delete configRemotes[name];

  if (isDefault) {
    const firstKey = Object.keys(configRemotes)[0];
    if (firstKey) configRemotes[firstKey].default = true;
  }

  db.remotes = configRemotes;
  config.db = db;
  await writeJsonFile(configPath, config);

  // Remove from secrets if split-config layout is in use
  if (hasSplitConfig()) {
    const secretsPath = getSecretsFilePath();
    const secrets = await readJsonFile(secretsPath);
    const secretsDb = (secrets.db ?? {}) as Record<string, unknown>;
    const secretsRemotes = (secretsDb.remotes ?? {}) as Record<string, unknown>;
    delete secretsRemotes[name];
    secretsDb.remotes = secretsRemotes;
    secrets.db = secretsDb;
    await writeJsonFile(secretsPath, secrets);
  }

  invalidateConfig();
  logger.success(`Remote "${name}" removed successfully`);
}

/**
 * Set a remote as the default.
 * Only updates postkit.config.json — the `default` flag is not sensitive.
 */
export async function setDefaultRemote(name: string): Promise<void> {
  const merged = loadPostkitConfig();
  if (!merged.db.remotes || !merged.db.remotes[name]) {
    throw new Error(`Remote "${name}" not found`);
  }

  const configPath = getConfigFilePath();
  const config = await readJsonFile(configPath);
  const db = (config.db ?? {}) as Record<string, unknown>;
  const configRemotes = (db.remotes ?? {}) as Record<string, Record<string, unknown>>;

  for (const key of Object.keys(configRemotes)) {
    delete configRemotes[key].default;
  }

  // Ensure the entry exists in config (it may only exist in secrets for legacy remotes)
  if (!configRemotes[name]) {
    configRemotes[name] = {};
  }
  configRemotes[name].default = true;

  db.remotes = configRemotes;
  config.db = db;
  await writeJsonFile(configPath, config);

  invalidateConfig();
  logger.success(`Remote "${name}" set as default`);
}

/**
 * Resolve the URL for a remote by name, or use the default
 */
export function resolveRemoteUrl(remoteName?: string): string {
  const remotes = getRemotes();

  if (remoteName) {
    const remote = remotes[remoteName];
    if (!remote) {
      throw new Error(
        `Remote "${remoteName}" not found.\n` +
        'Run "postkit db remote list" to see available remotes.',
      );
    }
    return remote.url;
  }

  const defaultName = getDefaultRemote();
  if (!defaultName) {
    throw new Error("No default remote configured.");
  }

  const remote = remotes[defaultName];
  if (!remote) throw new Error(`Remote "${defaultName}" not found.`);
  return remote.url;
}

/**
 * Resolve the name and URL for a remote by name, or use the default
 */
export function resolveRemote(remoteName?: string): {name: string; url: string} {
  const remotes = getRemotes();

  if (remoteName) {
    const remote = remotes[remoteName];
    if (!remote) {
      throw new Error(
        `Remote "${remoteName}" not found.\n` +
        'Run "postkit db remote list" to see available remotes.',
      );
    }
    return {name: remoteName, url: remote.url};
  }

  const defaultName = getDefaultRemote();
  if (!defaultName) {
    throw new Error("No default remote configured.");
  }

  const remote = remotes[defaultName];
  if (!remote) throw new Error(`Remote "${defaultName}" not found.`);
  return {name: defaultName, url: remote.url};
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function isValidRemoteName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

function isValidDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "postgres:" ||
      parsed.protocol === "postgresql:"
    );
  } catch {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.host = parsed.host.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/$/, "") || "/";
    return parsed.toString();
  } catch {
    return url;
  }
}

function findRemoteByUrl(
  remotes: Record<string, RemoteConfig> | undefined,
  url: string,
): string | null {
  if (!remotes) return null;
  const normalized = normalizeUrl(url);
  for (const [name, config] of Object.entries(remotes)) {
    if (normalizeUrl(config.url) === normalized) {
      return name;
    }
  }
  return null;
}

export function maskRemoteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "****";
    return parsed.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ":****@");
  }
}
