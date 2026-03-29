import type {PlanResult, ApplyResult} from "../types/index";
import {runCommand, commandExists} from "../../../common/shell";
import {getConfig, getPlanFilePath} from "../utils/db-config";
import {parseConnectionUrl} from "./database";
import fs from "fs/promises";
import {existsSync} from "fs";
import pg from "pg";

export async function checkPgschemaInstalled(): Promise<boolean> {
  const config = getConfig();
  return commandExists(config.pgSchemaBin);
}

export async function runPgschemaplan(
  schemaFile: string,
  databaseUrl: string,
): Promise<PlanResult> {
  const config = getConfig();
  const planFile = getPlanFilePath();
  const dbInfo = parseConnectionUrl(databaseUrl);

  // Run pgschema plan command
  const command = `${config.pgSchemaBin} plan --schema "${config.schema}" --file "${schemaFile}" --output-sql "${planFile}"`;
  const result = await runCommand(command, {
    env: {
      PGHOST: dbInfo.host,
      PGPORT: dbInfo.port.toString(),
      PGUSER: dbInfo.user,
      PGPASSWORD: dbInfo.password,
      PGDATABASE: dbInfo.database,
    },
  });

  if (result.exitCode !== 0 && !result.stderr.includes("No changes")) {
    throw new Error(`pgschema plan failed: ${result.stderr || result.stdout}`);
  }

  // Check if plan file was created and has content
  let hasChanges = false;
  let planOutput = "";

  if (existsSync(planFile)) {
    const rawPlan = await fs.readFile(planFile, "utf-8");
    hasChanges =
      rawPlan.trim().length > 0 && !rawPlan.includes("-- No changes");

    if (hasChanges) {
      // Wrap the raw plan with section markers
      planOutput = [
        "-- ============================================",
        "-- PRE-MIGRATION",
        "-- Add any custom SQL to run before the schema changes",
        "-- ============================================",
        "",
        "",
        "-- ============================================",
        "-- GENERATED PLAN (not recommended to change)",
        "-- ============================================",
        "",
        rawPlan.trim(),
        "",
        "",
        "-- ============================================",
        "-- POST-MIGRATION",
        "-- Add any custom SQL to run after the schema changes",
        "-- ============================================",
        "",
      ].join("\n");

      // Write back the wrapped content
      await fs.writeFile(planFile, planOutput, "utf-8");
    } else {
      planOutput = rawPlan;
    }
  }

  // If no changes detected via file, check command output
  if (
    !hasChanges &&
    (result.stdout.includes("No changes") ||
      result.stderr.includes("No changes"))
  ) {
    planOutput = "No changes detected";
  }

  return {
    hasChanges,
    planOutput: planOutput || result.stdout,
    planFile: hasChanges ? planFile : null,
  };
}

export async function wrapPlanSQL(planFile: string): Promise<string> {
  const config = getConfig();

  if (!existsSync(planFile)) {
    throw new Error(`Plan file not found: ${planFile}`);
  }

  const planSQL = await fs.readFile(planFile, "utf-8");

  if (!planSQL.trim() || planSQL.includes("-- No changes")) {
    return "";
  }

  return `SET search_path TO "${config.schema}";\nBEGIN;\n\n${planSQL.trim()}\n\nCOMMIT;\n`;
}

export async function runPgschemaDiff(
  schemaFile: string,
  databaseUrl: string,
): Promise<string> {
  const config = getConfig();
  const dbInfo = parseConnectionUrl(databaseUrl);

  // Run pgschema diff command to show differences
  const command = `${config.pgSchemaBin} diff --schema "${config.schema}" --file "${schemaFile}"`;
  const result = await runCommand(command, {
    env: {
      PGHOST: dbInfo.host,
      PGPORT: dbInfo.port.toString(),
      PGUSER: dbInfo.user,
      PGPASSWORD: dbInfo.password,
      PGDATABASE: dbInfo.database,
    },
  });

  if (
    result.exitCode !== 0 &&
    !result.stdout &&
    !result.stderr.includes("No differences")
  ) {
    throw new Error(`pgschema diff failed: ${result.stderr}`);
  }

  return result.stdout || result.stderr || "No differences found";
}

export async function getPlanFileContent(): Promise<string | null> {
  const planFile = getPlanFilePath();

  if (!existsSync(planFile)) {
    return null;
  }

  return fs.readFile(planFile, "utf-8");
}

export async function deletePlanFile(): Promise<void> {
  const planFile = getPlanFilePath();

  if (existsSync(planFile)) {
    await fs.unlink(planFile);
  }
}
