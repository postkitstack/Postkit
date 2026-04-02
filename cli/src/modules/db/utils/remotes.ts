import fs from "fs/promises";
import {logger} from "../../../common/logger";
import {loadPostkitConfig, getConfigFilePath, invalidateConfig, projectRoot} from "../../../common/config";
import type {RemoteConfig} from "../../../common/config";

export interface RemoteInfo {
  name: string;
  url: string;
  isDefault: boolean;
  addedAt?: string;
}

/**
 * Get all configured remotes from the config
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
    // If no default is explicitly set, use the first remote
    const firstRemote = Object.keys(remotes)[0];
    if (firstRemote) {
      return firstRemote;
    }
    return null;
  }

  return defaultName;
}

/**
 * Add a new remote configuration
 * @param name - Name of the remote
 * @param url - Database connection URL
 * @param setAsDefault - Whether to set this as the default remote
 */
export async function addRemote(name: string, url: string, setAsDefault: boolean = false): Promise<void> {
  const configPath = getConfigFilePath();
  const raw = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(raw);

  // Validate name — only letters, numbers, hyphens, underscores
  if (!name || name.trim().length === 0) {
    throw new Error("Remote name cannot be empty");
  }

  if (!isValidRemoteName(name)) {
    throw new Error(
      `Invalid remote name "${name}". Use only letters, numbers, hyphens (-), and underscores (_).`,
    );
  }

  // Check if remote already exists
  if (config.db.remotes && config.db.remotes[name]) {
    throw new Error(`Remote "${name}" already exists`);
  }

  // Basic URL format validation
  if (!isValidDatabaseUrl(url)) {
    throw new Error(
      "Invalid database URL format. Expected format: postgres://user:pass@host:port/database",
    );
  }

  // Initialize remotes object if it doesn't exist
  if (!config.db.remotes) {
    config.db.remotes = {};
  }

  // If this is the first remote or setAsDefault is true, clear other defaults
  const remoteCount = Object.keys(config.db.remotes).length;

  if (remoteCount === 0 || setAsDefault) {
    for (const key of Object.keys(config.db.remotes)) {
      delete config.db.remotes[key].default;
    }
  }

  // Add the new remote
  config.db.remotes[name] = {
    url,
    addedAt: new Date().toISOString(),
  };

  // Set as default if requested or if it's the first remote
  if (setAsDefault || remoteCount === 0) {
    config.db.remotes[name].default = true;
  }

  // Save the updated config
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  invalidateConfig();

  logger.success(`Remote "${name}" added successfully`);
}

/**
 * Remove a remote configuration
 * @param name - Name of the remote to remove
 * @param force - Skip confirmation (not used here, kept for API consistency)
 */
export async function removeRemote(name: string, force: boolean = false): Promise<void> {
  const configPath = getConfigFilePath();
  const raw = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(raw);

  if (!config.db.remotes || !config.db.remotes[name]) {
    throw new Error(`Remote "${name}" not found`);
  }

  const remotes = config.db.remotes;
  const remoteCount = Object.keys(remotes).length;

  // Cannot remove the only remote
  if (remoteCount === 1) {
    throw new Error(
      "Cannot remove the only remaining remote. Add another remote first.",
    );
  }

  // Check if it's the default remote
  const isDefault = remotes[name].default === true;

  if (isDefault && !force) {
    throw new Error(
      `Cannot remove default remote "${name}". Set another remote as default first:\n` +
      `  postkit db remote use <name>\n\n` +
      "Or use --force to remove anyway (another remote will become default).",
    );
  }

  // Remove the remote
  delete remotes[name];

  // If we removed the default, set the first remaining remote as default
  if (isDefault) {
    const firstKey = Object.keys(remotes)[0];
    if (firstKey) {
      remotes[firstKey].default = true;
    }
  }

  // Save the updated config
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  invalidateConfig();

  logger.success(`Remote "${name}" removed successfully`);
}

/**
 * Set a remote as the default
 * @param name - Name of the remote to set as default
 */
export async function setDefaultRemote(name: string): Promise<void> {
  const configPath = getConfigFilePath();
  const raw = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(raw);

  if (!config.db.remotes || !config.db.remotes[name]) {
    throw new Error(`Remote "${name}" not found`);
  }

  // Clear default flag from all remotes
  for (const key of Object.keys(config.db.remotes)) {
    delete config.db.remotes[key].default;
  }

  // Set the new default
  config.db.remotes[name].default = true;

  // Save the updated config
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  invalidateConfig();

  logger.success(`Remote "${name}" set as default`);
}

/**
 * Resolve the URL for a remote by name, or use the default
 * @param remoteName - Optional name of the remote to use
 * @returns The URL of the resolved remote
 * @throws Error if no remotes are configured or named remote not found
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

  // Use default remote
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
 * @param remoteName - Optional name of the remote to use
 * @returns Object with name and url of the resolved remote
 * @throws Error if no remotes are configured or named remote not found
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

  // Use default remote
  const defaultName = getDefaultRemote();
  if (!defaultName) {
    throw new Error("No default remote configured.");
  }

  const remote = remotes[defaultName];
  if (!remote) throw new Error(`Remote "${defaultName}" not found.`);
  return {name: defaultName, url: remote.url};
}

/**
 * Validate remote name — only alphanumeric, hyphens, underscores.
 * Prevents shell metacharacter injection and path traversal.
 */
function isValidRemoteName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Validate database URL format (basic check)
 */
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

/**
 * Mask sensitive parts of a database URL for logging
 */
export function maskRemoteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "****";
    return parsed.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ":****@");
  }
}
