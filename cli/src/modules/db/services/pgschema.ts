import path from "path";
import type {PlanResult} from "../types/index";
import {runCommand, commandExists} from "../../../common/shell";
import {getDbConfig, getPostkitDbDir} from "../utils/db-config";
import {parseConnectionUrl} from "./database";
import fs from "fs/promises";
import {existsSync} from "fs";

export async function checkPgschemaInstalled(): Promise<boolean> {
  const config = getDbConfig();

  // If resolved to an absolute path (bundled binary), check file existence
  if (path.isAbsolute(config.pgSchemaBin)) {
    return existsSync(config.pgSchemaBin);
  }

  // Otherwise check system PATH
  return commandExists(config.pgSchemaBin);
}

export async function runPgschemaplan(
  schemaFile: string,
  databaseUrl: string,
  schemaName: string,
  planFilePath: string,
): Promise<PlanResult> {
  const config = getDbConfig();
  const dbInfo = parseConnectionUrl(databaseUrl);

  // Run pgschema plan command (cwd set to schemaPath so .pgschemaignore is picked up)
  const command = `${config.pgSchemaBin} plan --schema "${schemaName}" --file "${schemaFile}" --output-sql "${planFilePath}"`;
  const result = await runCommand(command, {
    cwd: config.schemaPath,
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

  if (existsSync(planFilePath)) {
    const rawPlan = await fs.readFile(planFilePath, "utf-8");
    hasChanges =
      rawPlan.trim().length > 0 && !rawPlan.includes("-- No changes");

    if (hasChanges) {
      // Sanitize plan SQL to remove transaction-incompatible constructs
      const sanitized = sanitizePlanSQL(rawPlan);
      await fs.writeFile(planFilePath, sanitized, "utf-8");
      planOutput = sanitized.trim();
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
    planFile: hasChanges ? planFilePath : null,
  };
}

export async function wrapPlanSQL(planFile: string, schemaName: string): Promise<string> {
  if (!existsSync(planFile)) {
    throw new Error(`Plan file not found: ${planFile}`);
  }

  const planSQL = await fs.readFile(planFile, "utf-8");

  if (!planSQL.trim() || planSQL.includes("-- No changes")) {
    return "";
  }

  return `SET search_path TO "${schemaName}";\n\n${planSQL.trim()}\n`;
}

export async function runPgschemaDiff(
  schemaFile: string,
  databaseUrl: string,
  schemaName: string,
): Promise<string> {
  const config = getDbConfig();
  const dbInfo = parseConnectionUrl(databaseUrl);

  // Run pgschema diff command to show differences (cwd set to schemaPath so .pgschemaignore is picked up)
  const command = `${config.pgSchemaBin} diff --schema "${schemaName}" --file "${schemaFile}"`;
  const result = await runCommand(command, {
    cwd: config.schemaPath,
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

/**
 * Sanitize pgschema plan SQL to be compatible with dbmate's transaction-wrapped migrations.
 *
 * 1. Strip CONCURRENTLY from CREATE/DROP INDEX (cannot run inside a transaction)
 * 2. Remove -- pgschema:wait blocks (progress-monitoring SELECTs appended after CONCURRENT indexes)
 */
function sanitizePlanSQL(sql: string): string {
  // Remove -- pgschema:wait blocks: everything from the comment line to the next
  // DDL statement boundary (CREATE/ALTER/DROP/SET/SELECT at start of line) or EOF.
  const lines = sql.split("\n");
  const result: string[] = [];
  let inWaitBlock = false;

  for (const line of lines) {
    if (/^--\s*pgschema:wait\b/i.test(line.trim())) {
      inWaitBlock = true;
      continue;
    }

    if (inWaitBlock) {
      // End the wait block when we hit a DDL/SET statement or a blank line
      // followed by a non-wait comment or DDL
      const trimmed = line.trim();
      if (
        /^(CREATE|ALTER|DROP|SET|DO|INSERT|UPDATE|DELETE|GRANT|REVOKE)\s/i.test(trimmed) ||
        trimmed === "" ||
        /^--\s*(?!pgschema:wait)/i.test(trimmed)
      ) {
        inWaitBlock = false;
        // Don't skip this line — it's the start of the next real statement
        if (trimmed === "") continue; // skip blank separator lines between blocks
        result.push(line);
      }
      // else: still inside wait block, skip line
      continue;
    }

    result.push(line);
  }

  let cleaned = result.join("\n");

  // Strip CONCURRENTLY from CREATE [UNIQUE] INDEX CONCURRENTLY
  cleaned = cleaned.replace(
    /(CREATE\s+(?:UNIQUE\s+)?INDEX\s+)CONCURRENTLY\s+/gi,
    "$1",
  );

  // Strip CONCURRENTLY from DROP INDEX CONCURRENTLY
  cleaned = cleaned.replace(
    /(DROP\s+INDEX\s+)CONCURRENTLY\s+/gi,
    "$1",
  );

  return cleaned;
}

export async function getPlanFileContent(schemaName?: string): Promise<string | null> {
  const dbDir = getPostkitDbDir();

  if (schemaName) {
    const planFile = path.join(dbDir, `plan_${schemaName}.sql`);
    if (!existsSync(planFile)) return null;
    return fs.readFile(planFile, "utf-8");
  }

  // Return content of the first non-empty plan file found
  if (!existsSync(dbDir)) return null;
  const entries = await fs.readdir(dbDir);
  for (const entry of entries.sort()) {
    if (entry.startsWith("plan_") && entry.endsWith(".sql")) {
      const content = await fs.readFile(path.join(dbDir, entry), "utf-8");
      if (content.trim()) return content;
    }
  }
  return null;
}

export async function deletePlanFile(schemaName?: string): Promise<void> {
  const dbDir = getPostkitDbDir();

  if (!existsSync(dbDir)) return;

  if (schemaName) {
    const planFile = path.join(dbDir, `plan_${schemaName}.sql`);
    if (existsSync(planFile)) await fs.unlink(planFile);
    return;
  }

  // Delete all plan_*.sql files
  const entries = await fs.readdir(dbDir);
  for (const entry of entries) {
    if (entry.startsWith("plan_") && entry.endsWith(".sql")) {
      await fs.unlink(path.join(dbDir, entry));
    }
  }
}
