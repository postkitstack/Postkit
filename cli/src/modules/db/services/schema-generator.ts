import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import {createHash} from "crypto";
import {getDbConfig, getGeneratedSchemaPath} from "../utils/db-config";
import {getInfraSQL} from "./infra-generator";

interface SchemaSection {
  name: string;
  path: string;
  order: number;
}

const SCHEMA_ORDER: Record<string, number> = {
  infra: 0, // Infrastructure (schemas, extensions) — must come first
  core: 1, // Core extensions / setup
  extensions: 1,
  type: 2,
  types: 2,
  enums: 3,
  domains: 4,
  sequences: 5,
  function: 6, // Functions should generally come before tables if tables use them as defaults
  functions: 6,
  table: 7,
  tables: 7,
  view: 8,
  views: 8,
  materialized_view: 9,
  materialized_views: 9,
  trigger: 10,
  triggers: 10,
  indexes: 11,
  constraints: 12,
  rls: 13, // RLS policies
  policies: 13,
  grant: 14, // Grant statements — after all objects are created
  grants: 14,
};

export async function generateSchemaSQL(schemaName: string): Promise<string> {
  const {schemaFile} = await generateSchemaSQLAndFingerprint(schemaName);
  return schemaFile;
}

/**
 * Generate schema SQL and compute fingerprint in a single filesystem pass.
 * Reads from db/schema/<schemaName>/ when per-schema layout is detected,
 * falls back to db/schema/ directly for single-schema flat layout.
 */
export async function generateSchemaSQLAndFingerprint(schemaName: string): Promise<{
  schemaFile: string;
  fingerprint: string;
}> {
  const config = getDbConfig();
  const readRoot = path.join(config.schemaPath, schemaName);

  if (!existsSync(readRoot)) {
    throw new Error(`Schema directory not found: ${readRoot}`);
  }

  const sections = await discoverSchemaSections(readRoot);
  const sortedSections = sections.sort((a, b) => a.order - b.order);

  const parts: string[] = [
    "-- Generated schema file",
    `-- Schema: ${schemaName}`,
    `-- Generated at: ${new Date().toISOString()}`,
    "",
  ];

  const hash = createHash("sha256");

  for (const section of sortedSections) {
    const sectionContent = await loadSectionFiles(section.path);
    if (sectionContent) {
      parts.push(`-- ============================================`);
      parts.push(`-- Section: ${section.name}`);
      parts.push(`-- ============================================`);
      parts.push("");
      parts.push(sectionContent);
      parts.push("");
      hash.update(section.path);
      hash.update(sectionContent);
    }
  }

  // Fingerprint covers only schema source files — infra changes don't invalidate it
  const fingerprint = hash.digest("hex");

  // Prepend infra SQL so pgschema's internal temp schema has roles/extensions
  // available when it processes GRANT and CREATE POLICY statements
  const infraSQL = await getInfraSQL();
  const infraPrefix = infraSQL === "-- No infra files found"
    ? ""
    : `-- ============================================\n-- INFRA (roles, schemas, extensions)\n-- ============================================\n${infraSQL}\n\n`;

  const fullSchema = infraPrefix + parts.join("\n");

  // Write to per-schema generated file
  const outputPath = getGeneratedSchemaPath(schemaName);
  await fs.writeFile(outputPath, fullSchema, "utf-8");

  return {schemaFile: outputPath, fingerprint};
}

async function discoverSchemaSections(
  schemaPath: string,
): Promise<SchemaSection[]> {
  const entries = await fs.readdir(schemaPath, {withFileTypes: true});
  const sections: SchemaSection[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sectionName = entry.name.toLowerCase();

      // Skip seed directories - they contain data, not schema
      if (sectionName === "seed" || sectionName === "seeds") {
        continue;
      }

      const order = SCHEMA_ORDER[sectionName] ?? 100;

      sections.push({
        name: entry.name,
        path: path.join(schemaPath, entry.name),
        order,
      });
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      // Handle root-level SQL files
      const baseName = path.basename(entry.name, ".sql").toLowerCase();
      const order = SCHEMA_ORDER[baseName] ?? 100;

      sections.push({
        name: baseName,
        path: path.join(schemaPath, entry.name),
        order,
      });
    }
  }

  return sections;
}

async function loadSectionFiles(sectionPath: string): Promise<string> {
  const stat = await fs.stat(sectionPath);

  if (stat.isFile()) {
    return fs.readFile(sectionPath, "utf-8");
  }

  if (stat.isDirectory()) {
    const files = await fs.readdir(sectionPath);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort(); // Sort alphabetically for consistent ordering

    const contents: string[] = [];

    for (const file of sqlFiles) {
      const filePath = path.join(sectionPath, file);
      const content = await fs.readFile(filePath, "utf-8");

      contents.push(`-- File: ${file}`);
      contents.push(content.trim());
      contents.push("");
    }

    return contents.join("\n");
  }

  return "";
}

export async function deleteGeneratedSchema(): Promise<void> {
  const {getPostkitDbDir} = await import("../utils/db-config");
  const dbDir = getPostkitDbDir();

  if (!existsSync(dbDir)) return;

  const entries = await fs.readdir(dbDir);
  for (const entry of entries) {
    if (entry.startsWith("schema_") && entry.endsWith(".sql")) {
      await fs.unlink(path.join(dbDir, entry));
    }
  }
}
