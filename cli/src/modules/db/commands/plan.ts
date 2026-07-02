import ora from "ora";
import path from "path";
import {existsSync} from "fs";
import {logger} from "../../../common/logger";
import {requireActiveSession, assertLocalConnection, updatePendingChanges} from "../utils/session";
import {toRelativePath, getDbConfig, getPlanFilePath} from "../utils/db-config";
import {generateSchemaSQLAndFingerprint} from "../services/schema-generator";
import {runPgschemaplan} from "../services/pgschema";
import {applyInfraStep} from "../services/infra-generator";
import {parseConnectionUrl} from "../services/database";
import {runSpawnCommand} from "../../../common/shell";
import type {CommandOptions} from "../../../common/types";

export async function planCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    const session = await requireActiveSession();
    const config = getDbConfig();

    logger.heading("Generating Migration Plan");

    const totalSteps = config.schemas.length + 3;

    // Step 1: Test local connection
    logger.step(1, totalSteps, "Testing local database connection...");
    await assertLocalConnection(session, spinner);

    // Step 2: Apply infra so schema namespaces (CREATE SCHEMA) and roles exist
    // before pgschema plan runs — required for non-public schemas like "app"
    logger.step(2, totalSteps, "Applying infrastructure to local database...");
    await applyInfraStep(spinner, session.localDbUrl);

    const planFiles: Record<string, string | null> = {};
    const schemaFingerprints: Record<string, string | null> = {};
    const schemaOutputs: Array<{name: string; output: string; hasChanges: boolean}> = [];
    let anyChanges = false;

    for (let i = 0; i < config.schemas.length; i++) {
      const schemaName = config.schemas[i]!;
      const stepNum = i + 3;

      // Skip schemas with no directory — treat as not yet set up
      const schemaDir = path.join(config.schemaPath, schemaName);
      if (!existsSync(schemaDir)) {
        logger.warn(`Schema "${schemaName}" has no directory at ${schemaDir} — skipping. Run "postkit db schema add ${schemaName}" to scaffold it.`);
        planFiles[schemaName] = null;
        schemaFingerprints[schemaName] = null;
        continue;
      }

      // Generate schema SQL
      logger.step(stepNum, totalSteps, `Schema "${schemaName}": generating SQL...`);
      spinner.start(`Combining schema files for "${schemaName}"...`);
      const {schemaFile, fingerprint} = await generateSchemaSQLAndFingerprint(schemaName);
      spinner.succeed(`Schema SQL generated for "${schemaName}"`);

      schemaFingerprints[schemaName] = fingerprint;

      // Run pgschema plan
      spinner.start(`Running pgschema plan for "${schemaName}"...`);
      const planFilePath = getPlanFilePath(schemaName);
      const planResult = await runPgschemaplan(schemaFile, session.localDbUrl, schemaName, planFilePath);

      if (planResult.hasChanges) {
        spinner.succeed(`Plan generated for "${schemaName}"`);
        planFiles[schemaName] = toRelativePath(planFilePath);
        anyChanges = true;

        // Intermediate apply: apply this schema's plan to local DB so subsequent
        // schemas can reference its objects (e.g. cross-schema triggers/FKs)
        if (i < config.schemas.length - 1) {
          spinner.start(`Applying "${schemaName}" plan to local DB for cross-schema resolution...`);
          try {
            await applyPlanToLocalDb(session.localDbUrl, planFilePath);
            spinner.succeed(`"${schemaName}" applied to local DB (intermediate)`);
          } catch (err) {
            spinner.warn(`Intermediate apply for "${schemaName}" failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } else {
        spinner.succeed(`No changes for "${schemaName}"`);
        planFiles[schemaName] = null;
      }

      schemaOutputs.push({
        name: schemaName,
        output: planResult.planOutput,
        hasChanges: planResult.hasChanges,
      });
    }

    if (!anyChanges) {
      logger.blank();
      logger.info("Your schema files match the current database state.");
      logger.info("Make changes to schema files and run plan again.");

      // Still save fingerprints so apply can validate nothing changed
      await updatePendingChanges({
        planned: false,
        planFiles,
        schemaFingerprints,
        migrationApplied: false,
        seedsApplied: false,
      });
      return;
    }

    // Save plan state to session
    await updatePendingChanges({
      planned: true,
      applied: false,
      planFiles,
      schemaFingerprints,
      migrationApplied: false,
      seedsApplied: false,
    });

    // Display the combined plan
    logger.heading("Migration Plan");
    logger.blank();

    for (const {name, output, hasChanges} of schemaOutputs) {
      if (config.schemas.length > 1) {
        logger.info(`── Schema: ${name} ${ hasChanges ? "" : "(no changes)"}`);
        logger.blank();
      }
      if (hasChanges && output) {
        displayPlan(output);
        logger.blank();
      }
    }

    logger.success("Plan generated successfully!");
    logger.blank();

    const planFileList = Object.entries(planFiles)
      .filter(([, f]) => f !== null)
      .map(([name, f]) => `  ${name}: ${f}`)
      .join("\n");
    if (planFileList) {
      logger.info("Plan files:\n" + planFileList);
    }

    logger.blank();
    logger.info("Next steps:");
    logger.info("  - Review the changes above");
    logger.info('  - Run "postkit db apply" to apply to local clone');
    logger.info('  - Run "postkit db commit" when ready');
  } catch (error) {
    spinner.fail("Failed to generate plan");
    throw error;
  }
}

/**
 * Apply a plan SQL file directly to a database via psql.
 * Used for intermediate applies between schema plans so cross-schema refs resolve.
 */
async function applyPlanToLocalDb(dbUrl: string, planFilePath: string): Promise<void> {
  const {existsSync} = await import("fs");
  const {default: fs} = await import("fs/promises");

  if (!existsSync(planFilePath)) return;

  const sql = await fs.readFile(planFilePath, "utf-8");
  if (!sql.trim()) return;

  // Strip non-structural statements — policies/grants aren't needed for cross-schema
  // reference resolution and would cause duplicate errors when apply re-runs them.
  const structuralSQL = sql
    .split("\n")
    .filter((line) => {
      const upper = line.trim().toUpperCase();
      return (
        !upper.startsWith("CREATE POLICY") &&
        !upper.startsWith("DROP POLICY") &&
        !upper.startsWith("GRANT ") &&
        !upper.startsWith("REVOKE ")
      );
    })
    .join("\n");

  if (!structuralSQL.trim()) return;

  const dbInfo = parseConnectionUrl(dbUrl);
  const result = await runSpawnCommand(
    ["psql", "-h", dbInfo.host, "-p", String(dbInfo.port), "-U", dbInfo.user, "-d", dbInfo.database, "-v", "ON_ERROR_STOP=1"],
    {input: structuralSQL, env: {PGPASSWORD: dbInfo.password}},
  );

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
}

function displayPlan(planOutput: string): void {
  const lines = planOutput.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("--")) {
      console.log(`  ${line}`);
    } else if (
      trimmed.startsWith("CREATE") ||
      trimmed.startsWith("ALTER") ||
      trimmed.startsWith("DROP")
    ) {
      logger.sql(`  ${line}`);
    } else if (trimmed.length > 0) {
      console.log(`  ${line}`);
    }
  }
}
