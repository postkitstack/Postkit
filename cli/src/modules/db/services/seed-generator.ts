import fs from "fs/promises";
import path from "path";
import {existsSync} from "fs";
import type {Ora} from "ora";
import {getDbConfig} from "../utils/db-config";
import {loadSqlGroup} from "../utils/sql-loader";
import type {SeedStatement} from "../types/index";
import {PostkitError} from "../../../common/errors";

export async function loadSeeds(): Promise<SeedStatement[]> {
  const config = getDbConfig();
  const seedsPath = path.join(config.schemaPath, "seeds");

  if (!existsSync(seedsPath)) {
    // Try alternative location
    const altPath = path.join(config.schemaPath, "seed");

    if (existsSync(altPath)) {
      return loadSeedsFromDirectory(altPath);
    }

    return [];
  }

  return loadSeedsFromDirectory(seedsPath);
}

async function loadSeedsFromDirectory(
  dirPath: string,
): Promise<SeedStatement[]> {
  const seeds: SeedStatement[] = [];
  const entries = await fs.readdir(dirPath, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isFile() && entry.name.endsWith(".sql")) {
      const content = await fs.readFile(fullPath, "utf-8");
      seeds.push({
        name: path.basename(entry.name, ".sql"),
        content: content.trim(),
      });
    } else if (entry.isDirectory()) {
      const subSeeds = await loadSeedsFromSubdir(fullPath, entry.name);
      seeds.push(...subSeeds);
    }
  }

  return seeds;
}

async function loadSeedsFromSubdir(
  dirPath: string,
  groupName: string,
): Promise<SeedStatement[]> {
  return loadSqlGroup(dirPath, groupName);
}

export async function getSeedsSQL(): Promise<string> {
  const seeds = await loadSeeds();

  if (seeds.length === 0) {
    return "-- No seed files found";
  }

  const parts: string[] = [
    "-- ============================================",
    "-- SEED DATA",
    "-- ============================================",
    "",
  ];

  for (const seed of seeds) {
    parts.push(`-- Seed: ${seed.name}`);
    parts.push(seed.content);
    parts.push("");
  }

  return parts.join("\n");
}

export async function applySeeds(databaseUrl: string): Promise<void> {
  const {executeSQL} = await import("./database");
  const seeds = await loadSeeds();

  for (const seed of seeds) {
    if (seed.content.trim()) {
      await executeSQL(databaseUrl, seed.content);
    }
  }
}

export async function applySeedsStep(spinner: Ora, dbUrl: string, label = "local"): Promise<void> {
  const seeds = await loadSeeds();
  if (seeds.length === 0) {
    spinner.info("No seed files found - skipping");
    return;
  }
  try {
    spinner.start(`Applying seeds to ${label}...`);
    await applySeeds(dbUrl);
    spinner.succeed(`Seeds applied to ${label} (${seeds.length} file(s))`);
  } catch (error) {
    spinner.fail("Failed to apply seeds");
    throw new PostkitError(
      `Seeds failed: ${error instanceof Error ? error.message : String(error)}`,
      'Run "postkit db apply" again to retry from seeds.',
    );
  }
}
