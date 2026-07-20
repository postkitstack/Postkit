import pg from "pg";
import type {DatabaseConnectionInfo} from "../types/index";
import {runPipedCommands} from "../../../common/shell";
import {
  TEST_CONNECTION,
  CHECK_DB_EXISTS,
  TERMINATE_CONNECTIONS,
  COUNT_TABLES,
} from "../config/queries";

const {Client} = pg;

export async function withPgClient<T>(
  url: string,
  fn: (client: InstanceType<typeof Client>) => Promise<T>,
): Promise<T> {
  const client = new Client({connectionString: url});
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end();
  }
}

export function parseConnectionUrl(url: string): DatabaseConnectionInfo {
  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "5432", 10),
    database: parsed.pathname.slice(1), // Remove leading slash
    user: parsed.username,
    password: decodeURIComponent(parsed.password),
  };
}

function buildConnectionUrl(info: DatabaseConnectionInfo): string {
  const encodedPassword = encodeURIComponent(info.password);
  return `postgres://${info.user}:${encodedPassword}@${info.host}:${info.port}/${info.database}`;
}

export async function testConnection(url: string): Promise<boolean> {
  try {
    return await withPgClient(url, async (client) => {
      await client.query(TEST_CONNECTION);
      return true;
    });
  } catch {
    return false;
  }
}

export async function createDatabase(url: string): Promise<void> {
  const info = parseConnectionUrl(url);
  const targetDb = info.database;

  // Connect to postgres database to create the new one
  const adminUrl = buildConnectionUrl({...info, database: "postgres"});
  await withPgClient(adminUrl, async (client) => {
    // Check if database exists
    const result = await client.query(CHECK_DB_EXISTS, [targetDb]);
    if (result.rows.length === 0) {
      await client.query(`CREATE DATABASE "${targetDb}"`);
    }
  });
}

export async function dropDatabase(url: string): Promise<void> {
  const info = parseConnectionUrl(url);
  const targetDb = info.database;

  // Connect to postgres database to drop the target
  const adminUrl = buildConnectionUrl({...info, database: "postgres"});
  await withPgClient(adminUrl, async (client) => {
    // Terminate existing connections
    await client.query(TERMINATE_CONNECTIONS, [targetDb]);
    // Drop database if exists
    await client.query(`DROP DATABASE IF EXISTS "${targetDb}"`);
  });
}

/**
 * pg_dump always emits a bare `CREATE SCHEMA name;` (no IF NOT EXISTS), assuming
 * it's restoring into an empty database. Since infra now pre-creates schemas
 * (public/auth/storage/etc.) before the clone runs so roles exist for RLS
 * policies and grants, that line would collide with what infra already made.
 * Rewriting it to CREATE SCHEMA IF NOT EXISTS keeps it a no-op in that case.
 */
export function makeSchemaCreationIdempotent(line: string): string {
  return line.replace(/^CREATE SCHEMA (?!IF NOT EXISTS)(.+);$/, "CREATE SCHEMA IF NOT EXISTS $1;");
}

export async function cloneDatabase(
  sourceUrl: string,
  targetUrl: string,
  schemaOnly = false,
): Promise<void> {
  const src = parseConnectionUrl(sourceUrl);
  const dst = parseConnectionUrl(targetUrl);

  await dropDatabase(targetUrl);
  await createDatabase(targetUrl);

  // Args are passed directly to the OS — no shell involved, no injection risk.
  // Credentials are supplied only via the env field, never interpolated into args.
  const result = await runPipedCommands(
    {
      args: [
        "pg_dump",
        "-h", src.host,
        "-p", String(src.port),
        "-U", src.user,
        "-d", src.database,
        "--no-owner",
        ...(schemaOnly ? ["--schema-only"] : []),
      ],
      env: {PGPASSWORD: src.password},
    },
    {
      args: [
        "psql",
        "-h", dst.host,
        "-p", String(dst.port),
        "-U", dst.user,
        "-d", dst.database,
        "-v", "ON_ERROR_STOP=1",
      ],
      env: {PGPASSWORD: dst.password},
    },
    makeSchemaCreationIdempotent,
  );

  if (result.exitCode !== 0) {
    const errorDetail = result.stderr || result.stdout || "Unknown error (no output captured)";
    throw new Error(`Failed to clone database: ${errorDetail}`);
  }
}

export async function executeSQL(url: string, sql: string): Promise<string> {
  return withPgClient(url, async (client) => {
    const result = await client.query(sql);
    return JSON.stringify(result.rows, null, 2);
  });
}

export async function getTableCount(url: string): Promise<number> {
  return withPgClient(url, async (client) => {
    const result = await client.query(COUNT_TABLES);
    return parseInt(result.rows[0].count, 10);
  });
}

/**
 * Returns the major PostgreSQL version of a server (e.g. 14, 15, 16).
 * Uses SHOW server_version_num which returns a zero-padded integer like "160003".
 */
export async function getRemotePgMajorVersion(url: string): Promise<number> {
  return withPgClient(url, async (client) => {
    const result = await client.query("SHOW server_version_num");
    const num = parseInt(result.rows[0].server_version_num as string, 10);
    return Math.floor(num / 10000);
  });
}
