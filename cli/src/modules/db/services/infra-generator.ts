import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import {getConfig} from "../utils/db-config";
import type {InfraStatement} from "../types/index";

export async function generateInfra(): Promise<InfraStatement[]> {
  const config = getConfig();
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
  const infra = await generateInfra();

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
  const {parseConnectionUrl} = await import("./database");
  const {runCommandWithInput} = await import("../../../common/shell");
  const infra = await generateInfra();
  const dbInfo = parseConnectionUrl(databaseUrl);

  for (const stmt of infra) {
    if (stmt.content.trim()) {
      const result = await runCommandWithInput(
        `psql -h ${dbInfo.host} -p ${dbInfo.port} -U ${dbInfo.user} -d ${dbInfo.database} -v ON_ERROR_STOP=1`,
        stmt.content,
        {
          env: {PGPASSWORD: dbInfo.password},
        },
      );

      if (result.exitCode !== 0) {
        throw new Error(`Failed to apply infra "${stmt.name}": ${result.stderr || result.stdout}`);
      }
    }
  }
}
