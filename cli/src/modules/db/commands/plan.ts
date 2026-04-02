import ora from "ora";
import {logger} from "../../../common/logger";
import {getSession, updatePendingChanges} from "../utils/session";
import {generateSchemaSQL, generateSchemaFingerprint} from "../services/schema-generator";
import {runPgschemaplan} from "../services/pgschema";
import {testConnection} from "../services/database";
import type {CommandOptions} from "../../../common/types";
import {PostkitError} from "../../../errors";

export async function planCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      throw new PostkitError(
        "No active migration session.",
        'Run "postkit db start" to begin a new session.',
      );
    }

    logger.heading("Generating Migration Plan");

    // Step 1: Test local connection
    logger.step(1, 3, "Testing local database connection...");
    spinner.start("Connecting to local database...");

    const localConnected = await testConnection(session.localDbUrl);

    if (!localConnected) {
      spinner.fail("Failed to connect to local database");
      throw new PostkitError(
        "Could not connect to the local database.",
        'The local clone may have been removed. Run "postkit db start" again.',
      );
    }

    spinner.succeed("Connected to local database");

    // Step 2: Generate combined schema
    logger.step(2, 3, "Generating schema SQL...");
    spinner.start("Combining schema files...");

    const schemaFile = await generateSchemaSQL();
    const schemaFingerprint = await generateSchemaFingerprint();
    spinner.succeed(`Schema generated: ${schemaFile}`);

    // Step 3: Run pgschema plan
    logger.step(3, 3, "Running pgschema plan...");
    spinner.start("Comparing schema against local database...");

    const planResult = await runPgschemaplan(schemaFile, session.localDbUrl);

    if (!planResult.hasChanges) {
      spinner.succeed("No changes detected");
      logger.blank();
      logger.info("Your schema files match the current database state.");
      logger.info("Make changes to db/schema/ files and run plan again.");
      return;
    }

    spinner.succeed("Plan generated");

    // Update session
    await updatePendingChanges({
      planned: true,
      applied: false,
      planFile: planResult.planFile,
      schemaFingerprint,
      migrationApplied: false,
      grantsApplied: false,
      seedsApplied: false,
    });

    // Display the plan
    logger.heading("Migration Plan");
    logger.blank();

    if (planResult.planOutput) {
      displayPlan(planResult.planOutput);
    }

    logger.blank();
    logger.success("Plan generated successfully!");
    logger.blank();

    if (planResult.planFile) {
      logger.info(`Plan file: ${planResult.planFile}`);
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

function displayPlan(planOutput: string): void {
  const lines = planOutput.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("--")) {
      // Comment line
      console.log(`  ${line}`);
    } else if (
      trimmed.startsWith("CREATE") ||
      trimmed.startsWith("ALTER") ||
      trimmed.startsWith("DROP")
    ) {
      // DDL statement - highlight
      logger.sql(`  ${line}`);
    } else if (trimmed.length > 0) {
      console.log(`  ${line}`);
    }
  }
}
