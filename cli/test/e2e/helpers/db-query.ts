import pg from "pg";

/**
 * Execute a SQL query and return rows. Uses a fresh connection each time
 * to avoid state leakage between assertions.
 */
export async function queryDatabase<T = Record<string, unknown>>(
  url: string,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const client = new pg.Client({connectionString: url});
  try {
    await client.connect();
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

/**
 * Ensure a database exists. Connects to the default `postgres` DB
 * and creates the target database if missing.
 * Useful after abort which may drop the database.
 */
export async function ensureDatabaseExists(url: string): Promise<void> {
  const parsed = new URL(url);
  const dbName = parsed.pathname.slice(1); // remove leading /
  parsed.pathname = "/postgres"; // connect to default DB

  const client = new pg.Client({connectionString: parsed.toString()});
  try {
    await client.connect();
    await client.query(`CREATE DATABASE "${dbName}"`);
  } catch {
    // Database already exists — that's fine
  } finally {
    await client.end();
  }
}

/**
 * Execute a SQL statement (no return value).
 */
export async function executeSql(url: string, sql: string): Promise<void> {
  const client = new pg.Client({connectionString: url});
  try {
    await client.connect();
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Check if a table exists in the public schema.
 */
export async function tableExists(url: string, tableName: string): Promise<boolean> {
  const rows = await queryDatabase(
    url,
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists",
    [tableName],
  );
  return rows[0]?.exists === true;
}

/**
 * Get the number of rows in a table.
 */
export async function getTableRowCount(url: string, tableName: string): Promise<number> {
  const rows = await queryDatabase(url, `SELECT COUNT(*)::int AS count FROM "${tableName}"`);
  return rows[0]?.count ?? 0;
}

/**
 * Get the count of user tables in the public schema.
 */
export async function getTableCount(url: string): Promise<number> {
  const rows = await queryDatabase(
    url,
    "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  return rows[0]?.count ?? 0;
}
