import ora from "ora";
import path from "path";
import {logger} from "../../../common/logger";
import {getDbConfig} from "../utils/db-config";
import {
  validateSchemaName,
  scaffoldSchemaDirectories,
  resolveInfraTargetFile,
  appendSchemaToInfraFile,
  addSchemaToConfig,
} from "../services/schema-scaffold";
import type {CommandOptions} from "../../../common/types";

interface SchemaAddOptions extends CommandOptions {
  force?: boolean;
}

export async function schemaAddCommand(
  options: SchemaAddOptions,
  name: string,
): Promise<void> {
  const spinner = ora();

  try {
    logger.heading("Add Schema");

    // Step 0 (pre-flight): validate before starting spinner
    validateSchemaName(name);

    const config = getDbConfig();

    // Step 1: Scaffold directories
    logger.step(1, 3, "Scaffolding schema directories...");
    spinner.start("Creating directories...");

    const createdPaths = await scaffoldSchemaDirectories(
      config.schemaPath,
      name,
      !!options.force,
      !!options.dryRun,
    );

    if (options.dryRun) {
      spinner.info(`Dry run — would create ${createdPaths.length} directories`);
    } else {
      spinner.succeed(`Created ${createdPaths.length} directories`);
    }

    // Step 2: Update infra file
    logger.step(2, 3, "Updating infra file...");
    spinner.start("Updating infra...");

    const {filePath, isNew} = await resolveInfraTargetFile(config.infraPath);

    await appendSchemaToInfraFile(filePath, isNew, name, !!options.dryRun);

    if (options.dryRun) {
      spinner.info(
        `Dry run — would ${isNew ? "create" : "update"} ${path.relative(config.projectRoot, filePath)}`,
      );
    } else {
      spinner.succeed(
        `${isNew ? "Created" : "Updated"} ${path.relative(config.projectRoot, filePath)}`,
      );
    }

    // Step 3: Update config
    logger.step(3, 3, "Updating config...");
    spinner.start("Updating config...");

    await addSchemaToConfig(name, !!options.dryRun);

    if (options.dryRun) {
      spinner.info("Dry run — would update postkit.config.json");
    } else {
      spinner.succeed("Updated postkit.config.json");
    }

    // Summary
    logger.blank();
    logger.success(`Schema "${name}" is ready.`);
    logger.blank();

    if (options.dryRun) {
      logger.warn("Dry run — no files were written.");
      logger.blank();
    }

    logger.info("Scaffolded:");
    logger.info(`  db/schema/${name}/`);
    logger.info(
      "    tables/  views/  functions/  triggers/  types/  enums/  policies/  grants/  seeds/",
    );
    logger.blank();
    logger.info("Next steps:");
    logger.info(`  1. Add SQL files to db/schema/${name}/tables/, etc.`);
    logger.info(
      '  2. Run "postkit db infra --apply" to create the schema in your database',
    );
    logger.info('  3. Run "postkit db plan" to generate a migration');
  } catch (error) {
    spinner.fail("Failed to add schema");
    throw error;
  }
}
