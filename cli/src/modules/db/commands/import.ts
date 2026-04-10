import ora from "ora";
import fs from "fs/promises";
import {existsSync} from "fs";
import path from "path";
import {logger} from "../../../common/logger";
import {promptConfirm} from "../../../common/prompt";
import {PostkitError} from "../../../common/errors";
import {getDbConfig, getTmpImportDir, getCommittedMigrationsPath} from "../utils/db-config";
import {hasActiveSession} from "../utils/session";
import {testConnection, getTableCount, createDatabase} from "../services/database";
import {checkPgschemaInstalled} from "../services/pgschema";
import {checkDbmateInstalled, createMigrationFile, runCommittedMigrate} from "../services/dbmate";
import {
  runPgschemaDump,
  normalizeDumpForPostkit,
  generateBaselineDDL,
  syncMigrationState,
} from "../services/schema-importer";
import type {CommandOptions} from "../../../common/types";

interface ImportOptions extends CommandOptions {
  url?: string;
  schema?: string;
  name?: string;
}

function maskConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "****";
    return parsed.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ":****@");
  }
}

export async function importCommand(options: ImportOptions): Promise<void> {
  const spinner = ora();
  const migrationName = options.name || "imported_baseline";
  const schemaName = options.schema || "public";

  try {
    // Step 0: Check prerequisites
    if (await hasActiveSession()) {
      throw new PostkitError(
        "An active migration session exists.",
        'Run "postkit db abort" to cancel it first.',
      );
    }

    logger.heading("Import Database into PostKit");

    logger.step(1, 8, "Checking prerequisites...");

    const pgschemaInstalled = await checkPgschemaInstalled();
    const dbmateInstalled = await checkDbmateInstalled();

    if (!pgschemaInstalled) {
      throw new PostkitError(
        "pgschema binary not found.",
        "Visit: https://github.com/pgschema/pgschema",
      );
    }

    if (!dbmateInstalled) {
      throw new PostkitError(
        "dbmate binary not found.",
        "Install with: brew install dbmate  or  go install github.com/amacneil/dbmate@latest",
      );
    }

    logger.debug("Prerequisites check passed", options.verbose);

    // Step 1: Resolve target database and test connection
    logger.step(2, 8, "Validating database connection...");

    const config = getDbConfig();
    const targetUrl = options.url || config.localDbUrl;

    if (!targetUrl) {
      throw new PostkitError(
        "No database URL provided.",
        "Use --url flag or set localDbUrl in postkit.config.json.",
      );
    }

    logger.debug(`Target database: ${maskConnectionUrl(targetUrl)}`, options.verbose);

    spinner.start("Connecting to database...");
    const connected = await testConnection(targetUrl);

    if (!connected) {
      spinner.fail("Failed to connect to database");
      throw new PostkitError(
        `Could not connect to database: ${maskConnectionUrl(targetUrl)}`,
        "Check the database URL and ensure the database is running.",
      );
    }

    spinner.succeed("Connected to database");

    const tableCount = await getTableCount(targetUrl);
    logger.info(`Database has ${tableCount} table(s)`);

    if (tableCount === 0) {
      logger.warn("Database appears to be empty — importing anyway.");
    }

    // Step 2: Warn about existing files and confirm
    logger.step(3, 8, "Checking existing state...");

    const warnings: string[] = [];

    // Check if schema directory has files
    if (existsSync(config.schemaPath)) {
      const schemaFiles = await countSqlFiles(config.schemaPath);
      if (schemaFiles > 0) {
        warnings.push(`Schema directory (${config.schemaPath}) already has ${schemaFiles} SQL file(s) — they will be overwritten.`);
      }
    }

    // Check if migrations directory has files
    const migrationsDir = getCommittedMigrationsPath();
    if (existsSync(migrationsDir)) {
      const migrationFiles = await countSqlFiles(migrationsDir);
      if (migrationFiles > 0) {
        warnings.push(`Migrations directory (${migrationsDir}) already has ${migrationFiles} migration file(s) — they will be overwritten.`);
      }
    }

    // Check for stale temp directory
    const tmpDir = getTmpImportDir();
    if (existsSync(tmpDir)) {
      warnings.push("A temporary import directory already exists (likely from a failed previous run) — it will be cleaned up.");
    }

    if (warnings.length > 0) {
      logger.blank();
      logger.warn("Warnings:");
      for (const w of warnings) {
        logger.warn(`  - ${w}`);
      }
      logger.blank();
    }

    logger.info("This command will:");
    logger.info(`  1. Dump schema from ${maskConnectionUrl(targetUrl)} (schema: ${schemaName})`);
    logger.info("  2. Normalize the dump into PostKit schema directory structure");
    logger.info(`  3. Generate baseline migration: "${migrationName}"`);
    logger.info("  4. Insert migration tracking record in the source database");
    logger.info("  5. Set up local database with the imported schema");
    logger.blank();

    const confirmed = await promptConfirm(
      "Proceed with import?",
      {default: false, force: options.force},
    );

    if (!confirmed) {
      throw new PostkitError("Import cancelled.", undefined, 0);
    }

    // Step 3: Schema dump
    logger.step(4, 8, "Dumping database schema...");

    if (options.dryRun) {
      spinner.info("Dry run — skipping schema dump");
    } else {
      // Clean up any existing temp directory
      if (existsSync(tmpDir)) {
        await fs.rm(tmpDir, {recursive: true, force: true});
      }

      spinner.start("Running pgschema dump...");
      const dumpResult = await runPgschemaDump(targetUrl, schemaName, tmpDir);
      spinner.succeed(`Schema dump complete — ${dumpResult.files.length} file(s) produced`);

      if (options.verbose) {
        for (const f of dumpResult.files) {
          logger.debug(`  ${path.relative(tmpDir, f)}`, true);
        }
      }
    }

    // Step 4: Normalize dump into PostKit structure
    logger.step(5, 8, "Normalizing schema for PostKit...");

    if (options.dryRun) {
      spinner.info("Dry run — skipping normalization");
    } else {
      spinner.start("Normalizing schema files...");
      const normalizeResult = await normalizeDumpForPostkit(tmpDir, config.schemaPath, schemaName);
      spinner.succeed(`Normalized into ${normalizeResult.filesCreated.length} file(s)`);

      for (const f of normalizeResult.filesCreated) {
        logger.info(`  Created: ${f}`);
      }
    }

    // Step 5: Generate baseline migration using pgschema plan
    logger.step(6, 8, "Generating baseline migration...");

    if (options.dryRun) {
      spinner.info("Dry run — skipping baseline generation");
    } else {
      spinner.start("Generating baseline DDL via pgschema plan...");
      const baselineDDL = await generateBaselineDDL(config.schemaPath, schemaName);
      spinner.succeed("Baseline DDL generated");

      // Create migration file
      const migrationFile = await createMigrationFile(
        migrationName,
        `-- Baseline import\n-- Schema: ${schemaName}\n-- Imported at: ${new Date().toISOString()}\n\n${baselineDDL}`,
        "-- WARNING: Automatic rollback of a full baseline import is not supported.\n-- Manual intervention required to undo all imported objects.",
        getCommittedMigrationsPath(),
      );

      logger.success(`Baseline migration created: ${migrationFile.name}`);
      logger.debug(`  Path: ${migrationFile.path}`, options.verbose);

      // Step 6: Sync migration state with source database
      logger.step(7, 8, "Syncing migration state...");

      spinner.start("Inserting migration tracking record...");
      try {
        await syncMigrationState(targetUrl, migrationFile.timestamp);
        spinner.succeed("Migration tracking record inserted");
      } catch (error) {
        spinner.warn("Could not insert migration tracking record");
        logger.warn(
          `  ${error instanceof Error ? error.message : String(error)}`,
        );
        logger.warn("  The baseline migration file was created but the source database may not recognize it.");
        logger.warn("  You may need to manually insert the record into schema_migrations.");
      }

      // Step 7: Set up local database
      logger.step(8, 8, "Setting up local database...");

      spinner.start("Creating local database...");
      try {
        await createDatabase(config.localDbUrl);
        spinner.succeed("Local database created");
      } catch {
        spinner.warn("Local database may already exist — continuing");
      }

      spinner.start("Applying baseline migration to local database...");
      const migrateResult = await runCommittedMigrate(config.localDbUrl);
      if (migrateResult.success) {
        spinner.succeed("Baseline migration applied to local database");
      } else {
        spinner.warn("Could not apply baseline migration to local database");
        logger.warn(`  ${migrateResult.output}`);
      }
    }

    // Step 8: Cleanup
    if (!options.dryRun) {
      const tmpImportDir = getTmpImportDir();
      if (existsSync(tmpImportDir)) {
        await fs.rm(tmpImportDir, {recursive: true, force: true});
      }
    }

    // Summary
    logger.blank();
    logger.success("Database import complete!");
    logger.blank();
    logger.info("What was created:");
    logger.info("  - Schema files in db/schema/ (normalized from database dump)");
    logger.info(`  - Baseline migration in .postkit/db/migrations/`);
    logger.info("  - Local database set up with imported schema");
    logger.blank();
    logger.info("Next steps:");
    logger.info("  1. Review the schema files in db/schema/");
    logger.info('  2. Add a remote: postkit db remote add <name> <url>');
    logger.info('  3. Start working: modify schema files, then "postkit db plan" to see changes');
  } catch (error) {
    spinner.fail("Import failed");
    throw error;
  }
}

async function countSqlFiles(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;

  let count = 0;
  const entries = await fs.readdir(dir, {withFileTypes: true});

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".sql")) {
      count++;
    } else if (entry.isDirectory()) {
      count += await countSqlFiles(path.join(dir, entry.name));
    }
  }

  return count;
}
