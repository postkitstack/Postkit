import {Client} from "pg";
import type {StackConfig} from "../types/config";
import {buildPgUrl} from "../services/db-init";

const KEY = "is_initial";

/**
 * Read the is_initial flag from postkit.stack_config.
 * Returns true (treat as initial) if the table/row doesn't exist or on any error.
 */
export async function readStackIsInitial(config: StackConfig): Promise<boolean> {
  const client = new Client({connectionString: buildPgUrl(config)});
  try {
    await client.connect();
    const res = await client.query<{value: string}>(
      "SELECT value FROM postkit.stack_config WHERE key = $1",
      [KEY],
    );
    if (res.rows.length === 0) return true;
    return (res.rows[0]?.value ?? "true") !== "false";
  } catch {
    return true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Mark the stack as initialized by setting is_initial = 'false' in the DB.
 */
export async function setStackInitialized(config: StackConfig): Promise<void> {
  const client = new Client({connectionString: buildPgUrl(config)});
  try {
    await client.connect();
    await client.query(
      `INSERT INTO postkit.stack_config (key, value, updated_at)
       VALUES ($1, 'false', now())
       ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = now()`,
      [KEY],
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
