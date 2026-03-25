import ora from "ora";
import {logger} from "../../../common/logger";
import {getSession, updatePendingChanges} from "../utils/session";
import {generateSchemaSQL} from "../services/schema-generator";
import {runPgschemaplan} from "../services/pgschema";
import {testConnection} from "../services/database";
import {applyInfra, generateInfra} from "../services/infra-generator";
import type {CommandOptions} from "../../../common/types";

export async function planCommand(options: CommandOptions): Promise<void> {
  const spinner = ora();

  try {
    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      logger.error("No active migration session.");
      logger.info('Run "postkit db start" to begin a new session.');
      process.exit(1);
    }

    logger.heading("Generating Migration Plan");

    // Step 1: Test local connection
    logger.step(1, 5, "Testing local database connection...");
    spinner.start("Connecting to local database...");

    const localConnected = await testConnection(session.localDbUrl);

    if (!localConnected) {
      spinner.fail("Failed to connect to local database");
      logger.error("Could not connect to the local database.");
      logger.info(
        'The local clone may have been removed. Run "postkit db start" again.',
      );
      process.exit(1);
    }

    spinner.succeed("Connected to local database");

    // Step 2: Apply infra (pre-step so pgschema can resolve schemas/extensions/roles)
    logger.step(2, 5, "Applying infrastructure...");

    const infra = await generateInfra();

    if (infra.length === 0) {
      spinner.info("No infra files found - skipping");
    } else {
      spinner.start("Applying infra...");
      await applyInfra(session.localDbUrl);
      spinner.succeed(`Infra applied (${infra.length} file(s))`);
    }

    // Step 3: Generate combined schema
    logger.step(3, 5, "Generating schema SQL...");
    spinner.start("Combining schema files...");

    const schemaFile = await generateSchemaSQL();
    spinner.succeed(`Schema generated: ${schemaFile}`);

    // Step 4: Run pgschema plan
    logger.step(4, 5, "Running pgschema plan...");
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

    // Step 5: Update session
    logger.step(5, 5, "Updating session state...");

    await updatePendingChanges({
      planned: true,
      applied: false,
      planFile: planResult.planFile,
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
    logger.info('  - Run "postkit db commit <description>" when ready');
  } catch (error) {
    spinner.fail("Failed to generate plan");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
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
