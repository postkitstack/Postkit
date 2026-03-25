import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import {getConfig, getGeneratedSchemaPath} from "../utils/db-config";

interface SchemaSection {
  name: string;
  path: string;
  order: number;
}

const SCHEMA_ORDER: Record<string, number> = {
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
  trigger: 9,
  triggers: 9,
  indexes: 10,
  constraints: 11,
  rls: 12, // RLS policies
  policies: 12,
};

export async function generateSchemaSQL(): Promise<string> {
  const config = getConfig();
  const schemaPath = config.schemaPath;

  if (!existsSync(schemaPath)) {
    throw new Error(`Schema directory not found: ${schemaPath}`);
  }

  const sections = await discoverSchemaSections(schemaPath);
  const sortedSections = sections.sort((a, b) => a.order - b.order);

  const parts: string[] = [
    "-- Generated schema file",
    `-- Generated at: ${new Date().toISOString()}`,
    "",
  ];

  for (const section of sortedSections) {
    const sectionContent = await loadSectionFiles(section.path);
    if (sectionContent) {
      parts.push(`-- ============================================`);
      parts.push(`-- Section: ${section.name}`);
      parts.push(`-- ============================================`);
      parts.push("");
      parts.push(sectionContent);
      parts.push("");
    }
  }

  const fullSchema = parts.join("\n");

  // Write to generated schema file
  const outputPath = getGeneratedSchemaPath();
  await fs.writeFile(outputPath, fullSchema, "utf-8");

  return outputPath;
}

async function discoverSchemaSections(
  schemaPath: string,
): Promise<SchemaSection[]> {
  const entries = await fs.readdir(schemaPath, {withFileTypes: true});
  const sections: SchemaSection[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sectionName = entry.name.toLowerCase();

      // Skip seed, grant, and infra directories - they are applied separately
      if (
        sectionName === "seed" ||
        sectionName === "seeds" ||
        sectionName === "grant" ||
        sectionName === "grants" ||
        sectionName === "grant-permissions" ||
        sectionName === "infra"
      ) {
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

export async function getSchemaFiles(): Promise<string[]> {
  const config = getConfig();
  const schemaPath = config.schemaPath;

  if (!existsSync(schemaPath)) {
    return [];
  }

  return collectSqlFiles(schemaPath);
}

const SKIP_DIRECTORIES = new Set([
  "seed",
  "seeds",
  "grant",
  "grants",
  "grant-permissions",
  "infra",
]);

async function collectSqlFiles(
  dirPath: string,
  isRoot = true,
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dirPath, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip seed and grant directories at the schema root level
      if (isRoot && SKIP_DIRECTORIES.has(entry.name.toLowerCase())) {
        continue;
      }
      const subFiles = await collectSqlFiles(fullPath, false);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

export async function deleteGeneratedSchema(): Promise<void> {
  const outputPath = getGeneratedSchemaPath();

  if (existsSync(outputPath)) {
    await fs.unlink(outputPath);
  }
}
