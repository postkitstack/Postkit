import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import {getConfig} from "../utils/db-config";
import type {GrantStatement} from "../types/index";

export async function generateGrants(): Promise<GrantStatement[]> {
  const config = getConfig();
  const grantsPath = path.join(config.schemaPath, "grants");

  if (!existsSync(grantsPath)) {
    // Try alternative locations
    const altPaths = [
      path.join(config.schemaPath, "policies"),
      path.join(config.projectRoot, "grants"),
    ];

    for (const altPath of altPaths) {
      if (existsSync(altPath)) {
        return loadGrantsFromDirectory(altPath);
      }
    }

    return [];
  }

  return loadGrantsFromDirectory(grantsPath);
}

async function loadGrantsFromDirectory(
  dirPath: string,
): Promise<GrantStatement[]> {
  const grants: GrantStatement[] = [];
  const entries = await fs.readdir(dirPath, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isFile() && entry.name.endsWith(".sql")) {
      const content = await fs.readFile(fullPath, "utf-8");
      grants.push({
        schema: path.basename(entry.name, ".sql"),
        content: content.trim(),
      });
    } else if (entry.isDirectory()) {
      // Load grants from subdirectory (e.g., grants/public/, grants/app/)
      const subGrants = await loadGrantsFromSubdir(fullPath, entry.name);
      grants.push(...subGrants);
    }
  }

  return grants;
}

async function loadGrantsFromSubdir(
  dirPath: string,
  schemaName: string,
): Promise<GrantStatement[]> {
  const grants: GrantStatement[] = [];
  const files = await fs.readdir(dirPath);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

  const contents: string[] = [];

  for (const file of sqlFiles) {
    const filePath = path.join(dirPath, file);
    const content = await fs.readFile(filePath, "utf-8");
    contents.push(`-- ${file}`);
    contents.push(content.trim());
  }

  if (contents.length > 0) {
    grants.push({
      schema: schemaName,
      content: contents.join("\n\n"),
    });
  }

  return grants;
}

export async function getGrantsSQL(): Promise<string> {
  const grants = await generateGrants();

  if (grants.length === 0) {
    return "-- No grant files found";
  }

  const parts: string[] = [
    "-- ============================================",
    "-- GRANT STATEMENTS",
    "-- ============================================",
    "",
  ];

  for (const grant of grants) {
    parts.push(`-- Schema: ${grant.schema}`);
    parts.push(grant.content);
    parts.push("");
  }

  return parts.join("\n");
}

export async function applyGrants(databaseUrl: string): Promise<void> {
  const {executeSQL} = await import("./database");
  const grants = await generateGrants();

  for (const grant of grants) {
    if (grant.content.trim()) {
      await executeSQL(databaseUrl, grant.content);
    }
  }
}
