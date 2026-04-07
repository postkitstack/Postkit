import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import {getDbConfig} from "../utils/db-config";
import {parseConnectionUrl} from "./database";
import {runSpawnCommand} from "../../../common/shell";
import type {InfraStatement} from "../types/index";

export async function loadInfra(): Promise<InfraStatement[]> {
  const config = getDbConfig();
  const infraPath = path.join(config.schemaPath, "infra");

  if (!existsSync(infraPath)) {
    return [];
  }

  return loadInfraFromDirectory(infraPath);
}

async function loadInfraFromDirectory(
  dirPath: string,
): Promise<InfraStatement[]> {
  const infra: InfraStatement[] = [];
  const entries = await fs.readdir(dirPath, {withFileTypes: true});
  const sqlFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sqlFiles) {
    const fullPath = path.join(dirPath, entry.name);
    const content = await fs.readFile(fullPath, "utf-8");
    infra.push({
      name: path.basename(entry.name, ".sql"),
      content: content.trim(),
    });
  }

  return infra;
}

export async function getInfraSQL(): Promise<string> {
  const infra = await loadInfra();

  if (infra.length === 0) {
    return "-- No infra files found";
  }

  const parts: string[] = [
    "-- ============================================",
    "-- INFRASTRUCTURE STATEMENTS",
    "-- ============================================",
    "",
  ];

  for (const stmt of infra) {
    parts.push(`-- Infra: ${stmt.name}`);
    parts.push(stmt.content);
    parts.push("");
  }

  return parts.join("\n");
}

export async function applyInfra(databaseUrl: string): Promise<void> {
  const infra = await loadInfra();
  const nonEmpty = infra.filter((stmt) => stmt.content.trim());

  if (nonEmpty.length === 0) {
    return;
  }

  const dbInfo = parseConnectionUrl(databaseUrl);

  // Batch all statements into a single psql call — one process instead of N.
  // Args passed directly to OS — no shell, no injection risk.
  // PGPASSWORD supplied only via env, never interpolated into args.
  const combinedSQL = nonEmpty.map((stmt) => stmt.content).join("\n\n");
  const result = await runSpawnCommand(
    [
      "psql",
      "-h", dbInfo.host,
      "-p", String(dbInfo.port),
      "-U", dbInfo.user,
      "-d", dbInfo.database,
      "-v", "ON_ERROR_STOP=1",
    ],
    {input: combinedSQL, env: {PGPASSWORD: dbInfo.password}},
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to apply infra: ${result.stderr || result.stdout}`);
  }
}
