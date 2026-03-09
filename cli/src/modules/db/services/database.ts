import pg from "pg";
import type {DatabaseConnectionInfo} from "../types/index";
import {runCommand} from "../../../common/shell";

const {Client} = pg;

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

export function buildConnectionUrl(info: DatabaseConnectionInfo): string {
  const encodedPassword = encodeURIComponent(info.password);
  return `postgres://${info.user}:${encodedPassword}@${info.host}:${info.port}/${info.database}`;
}

export async function testConnection(url: string): Promise<boolean> {
  const client = new Client({connectionString: url});

  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

export async function databaseExists(url: string): Promise<boolean> {
  try {
    return await testConnection(url);
  } catch {
    return false;
  }
}

export async function createDatabase(url: string): Promise<void> {
  const info = parseConnectionUrl(url);
  const targetDb = info.database;

  // Connect to postgres database to create the new one
  const adminUrl = buildConnectionUrl({...info, database: "postgres"});
  const client = new Client({connectionString: adminUrl});

  try {
    await client.connect();

    // Check if database exists
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDb],
    );

    if (result.rows.length === 0) {
      await client.query(`CREATE DATABASE "${targetDb}"`);
    }
  } finally {
    await client.end();
  }
}

export async function dropDatabase(url: string): Promise<void> {
  const info = parseConnectionUrl(url);
  const targetDb = info.database;

  // Connect to postgres database to drop the target
  const adminUrl = buildConnectionUrl({...info, database: "postgres"});
  const client = new Client({connectionString: adminUrl});

  try {
    await client.connect();

    // Terminate existing connections
    await client.query(
      `
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `,
      [targetDb],
    );

    // Drop database if exists
    await client.query(`DROP DATABASE IF EXISTS "${targetDb}"`);
  } finally {
    await client.end();
  }
}

export async function cloneDatabase(
  sourceUrl: string,
  targetUrl: string,
): Promise<void> {
  const sourceInfo = parseConnectionUrl(sourceUrl);
  const targetInfo = parseConnectionUrl(targetUrl);

  // Drop target if exists
  await dropDatabase(targetUrl);

  // Create target database
  await createDatabase(targetUrl);

  // Use pg_dump and psql to clone (pipefail ensures pg_dump errors are caught)
  const dumpCmd = `PGPASSWORD="${sourceInfo.password}" pg_dump -h ${sourceInfo.host} -p ${sourceInfo.port} -U ${sourceInfo.user} -d ${sourceInfo.database} --no-owner --no-acl`;
  const restoreCmd = `PGPASSWORD="${targetInfo.password}" psql -h ${targetInfo.host} -p ${targetInfo.port} -U ${targetInfo.user} -d ${targetInfo.database}`;

  const result = await runCommand(`bash -c 'set -o pipefail; ${dumpCmd} | ${restoreCmd}'`);

  if (result.exitCode !== 0) {
    const errorDetail = result.stderr || result.stdout || "Unknown error (no output captured)";
    throw new Error(`Failed to clone database: ${errorDetail}`);
  }
}

export async function executeSQL(url: string, sql: string): Promise<string> {
  const client = new Client({connectionString: url});

  try {
    await client.connect();
    const result = await client.query(sql);
    return JSON.stringify(result.rows, null, 2);
  } finally {
    await client.end();
  }
}

export async function getTableCount(url: string): Promise<number> {
  const client = new Client({connectionString: url});

  try {
    await client.connect();
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
    `);
    return parseInt(result.rows[0].count, 10);
  } finally {
    await client.end();
  }
}
