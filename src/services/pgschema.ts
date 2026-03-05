import type { PlanResult, ApplyResult } from '../types/index.js';
import { runCommand, commandExists } from '../utils/shell.js';
import { getConfig, getPlanFilePath } from '../utils/config.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';

export async function checkPgschemaInstalled(): Promise<boolean> {
  const config = getConfig();
  return commandExists(config.pgSchemaBin);
}

export async function runPgschemaplan(
  schemaFile: string,
  databaseUrl: string
): Promise<PlanResult> {
  const config = getConfig();
  const planFile = getPlanFilePath();

  // Run pgschema plan command
  const command = `${config.pgSchemaBin} plan --schema "${schemaFile}" --database "${databaseUrl}" --output "${planFile}"`;
  const result = await runCommand(command);

  if (result.exitCode !== 0 && !result.stderr.includes('No changes')) {
    throw new Error(`pgschema plan failed: ${result.stderr || result.stdout}`);
  }

  // Check if plan file was created and has content
  let hasChanges = false;
  let planOutput = '';

  if (existsSync(planFile)) {
    planOutput = await fs.readFile(planFile, 'utf-8');
    hasChanges = planOutput.trim().length > 0 && !planOutput.includes('-- No changes');
  }

  // If no changes detected via file, check command output
  if (!hasChanges && (result.stdout.includes('No changes') || result.stderr.includes('No changes'))) {
    planOutput = 'No changes detected';
  }

  return {
    hasChanges,
    planOutput: planOutput || result.stdout,
    planFile: hasChanges ? planFile : null,
  };
}

export async function runPgschemaApply(
  planFile: string,
  databaseUrl: string
): Promise<ApplyResult> {
  const config = getConfig();

  // Check if plan file exists
  if (!existsSync(planFile)) {
    throw new Error(`Plan file not found: ${planFile}`);
  }

  // Run pgschema apply command
  const command = `${config.pgSchemaBin} apply --plan "${planFile}" --database "${databaseUrl}"`;
  const result = await runCommand(command);

  if (result.exitCode !== 0) {
    return {
      success: false,
      output: result.stderr || result.stdout,
    };
  }

  return {
    success: true,
    output: result.stdout,
  };
}

export async function runPgschemaDiff(
  schemaFile: string,
  databaseUrl: string
): Promise<string> {
  const config = getConfig();

  // Run pgschema diff command to show differences
  const command = `${config.pgSchemaBin} diff --schema "${schemaFile}" --database "${databaseUrl}"`;
  const result = await runCommand(command);

  if (result.exitCode !== 0 && !result.stdout && !result.stderr.includes('No differences')) {
    throw new Error(`pgschema diff failed: ${result.stderr}`);
  }

  return result.stdout || result.stderr || 'No differences found';
}

export async function getPlanFileContent(): Promise<string | null> {
  const planFile = getPlanFilePath();

  if (!existsSync(planFile)) {
    return null;
  }

  return fs.readFile(planFile, 'utf-8');
}

export async function deletePlanFile(): Promise<void> {
  const planFile = getPlanFilePath();

  if (existsSync(planFile)) {
    await fs.unlink(planFile);
  }
}
