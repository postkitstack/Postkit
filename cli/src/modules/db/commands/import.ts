import ora from "ora";
import fs from "fs/promises";
import {existsSync} from "fs";
import path from "path";
import {logger} from "../../../common/logger";
import {promptConfirm} from "../../../common/prompt";
import {PostkitError} from "../../../common/errors";
import {getDbConfig, getTmpImportDir, getCommittedMigrationsPath, toRelativePath} from "../utils/db-config";
import {hasActiveSession} from "../utils/session";
import {maskRemoteUrl} from "../utils/remotes";
import {addCommittedMigration, saveCommittedState} from "../utils/committed";
import {testConnection, getTableCount, createDatabase} from "../services/database";
import {resolveLocalDb, stopSessionContainer} from "../services/container";
import {deletePlanFile} from "../services/pgschema";
import {createMigrationFile, runCommittedMigrate} from "../services/dbmate";
import {checkDbPrerequisites} from "../services/prerequisites";
import {deleteGeneratedSchema} from "../services/schema-generator";
import {
  runPgschemaDump,
  normalizeDumpForPostkit,
  generateBaselineDDL,
  syncMigrationState,
  applyInfraToDatabase,
} from "../services/schema-importer";
import type {CommandOptions} from "../../../common/types";

interface ImportOptions extends CommandOptions {
  url?: string;
  schema?: string;
  schemas?: string;
  name?: string;
}

export async function importCommand(options: ImportOptions): Promise<void> {
  const spinner = ora();
  const config = getDbConfig();
  const migrationName = options.name || "imported_baseline";

  // Resolve schemas list: --schemas "public,app" > --schema "public" > config.schemas
  const schemasToImport: string[] = options.schemas
    ? options.schemas.split(",").map((s) => s.trim()).filter(Boolean)
    : options.schema
      ? [options.schema]
      : config.schemas;

  let tempContainerID: string | undefined;

  async function cleanupContainer(): Promise<void> {
    if (tempContainerID) {
      try { await stopSessionContainer(tempContainerID); } catch { /* best effort */ }
    }
  }

  try {
    if (await hasActiveSession()) {
      throw new PostkitError(
        "An active migration session exists.",
        'Run "postkit db abort" to cancel it first.',
      );
    }

    logger.heading("Import Database into PostKit");

    logger.step(1, 8, "Checking prerequisites...");
    await checkDbPrerequisites(options.verbose ?? false);

    // Step 2: Resolve target database and test connection
    logger.step(2, 8, "Validating database connection...");

    const targetUrl = options.url || config.localDbUrl;

    if (!targetUrl) {
      throw new PostkitError(
        "No database URL provided.",
        "Use --url flag or set localDbUrl in postkit.secrets.json.",
      );
    }

    logger.debug(`Target database: ${maskRemoteUrl(targetUrl)}`, options.verbose);

    spinner.start("Connecting to database...");
    const connected = await testConnection(targetUrl);

    if (!connected) {
      spinner.fail("Failed to connect to database");
      throw new PostkitError(
        `Could not connect to database: ${maskRemoteUrl(targetUrl)}`,
        "Check the database URL and ensure the database is running.",
      );
    }

    spinner.succeed("Connected to database");

    const tableCount = await getTableCount(targetUrl);
    logger.info(`Database has ${tableCount} table(s)`);

    if (tableCount === 0) {
      logger.warn("Database appears to be empty — importing anyway.");
    }

    // Step 3: Warn about existing files and confirm
    logger.step(3, 8, "Checking existing state...");

    const warnings: string[] = [];

    if (existsSync(config.schemaPath)) {
      const schemaFiles = await countSqlFiles(config.schemaPath);
      if (schemaFiles > 0) {
        warnings.push(`Schema directory (${config.schemaPath}) has ${schemaFiles} SQL file(s) — it will be CLEARED and replaced with imported schema files.`);
      }
    }

    const migrationsDir = getCommittedMigrationsPath();
    if (existsSync(migrationsDir)) {
      const migrationFiles = await countSqlFiles(migrationsDir);
      if (migrationFiles > 0) {
        warnings.push(`Migrations directory (${migrationsDir}) has ${migrationFiles} migration file(s) — it will be CLEARED and replaced with the baseline migration.`);
      }
    }

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
    logger.info(`  1. Dump schemas from ${maskRemoteUrl(targetUrl)} (schemas: ${schemasToImport.join(", ")})`);
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

    // Step 4: Schema dump — one per schema
    logger.step(4, 8, "Dumping database schema...");

    if (options.dryRun) {
      spinner.info("Dry run — skipping schema dump");
    } else {
      if (existsSync(tmpDir)) {
        await fs.rm(tmpDir, {recursive: true, force: true});
      }

      for (const schemaName of schemasToImport) {
        const schemaTmpDir = path.join(tmpDir, schemaName);
        spinner.start(`Running pgschema dump for "${schemaName}"...`);
        const dumpResult = await runPgschemaDump(targetUrl, schemaName, schemaTmpDir);
        spinner.succeed(`Schema dump complete for "${schemaName}" — ${dumpResult.files.length} file(s)`);

        if (options.verbose) {
          for (const f of dumpResult.files) {
            logger.debug(`  ${path.relative(schemaTmpDir, f)}`, true);
          }
        }
      }
    }

    // Step 5: Normalize dump into PostKit structure — one per schema
    logger.step(5, 8, "Normalizing schema for PostKit...");

    if (options.dryRun) {
      spinner.info("Dry run — skipping normalization");
    } else {
      // Clear schema directory before normalizing
      if (existsSync(config.schemaPath)) {
        const entries = await fs.readdir(config.schemaPath, {withFileTypes: true});
        for (const entry of entries) {
          if (entry.name === ".pgschemaignore") continue;
          await fs.rm(path.join(config.schemaPath, entry.name), {recursive: true, force: true});
        }
      }

      for (const schemaName of schemasToImport) {
        const schemaTmpDir = path.join(tmpDir, schemaName);
        const schemaDestDir = path.join(config.schemaPath, schemaName);
        spinner.start(`Normalizing "${schemaName}"...`);
        const normalizeResult = await normalizeDumpForPostkit(schemaTmpDir, schemaDestDir, schemaName, targetUrl);
        spinner.succeed(`Normalized "${schemaName}" — ${normalizeResult.filesCreated.length} file(s)`);

        for (const f of normalizeResult.filesCreated) {
          logger.info(`  Created: ${f}`);
        }
      }
    }

    // Step 6: Resolve local DB URL
    logger.step(6, 8, "Setting up local database...");

    let localDbUrl = config.localDbUrl;
    if (!options.dryRun) {
      const resolved = await resolveLocalDb(config.localDbUrl, targetUrl, spinner);
      localDbUrl = resolved.url;
      tempContainerID = resolved.containerID;
    }

    // Step 7: Generate baseline migration using pgschema plan (all schemas, ordered)
    logger.step(7, 8, "Generating baseline migration...");

    if (options.dryRun) {
      spinner.info("Dry run — skipping baseline generation");
    } else {
      spinner.start("Generating baseline DDL via pgschema plan...");
      const baselineDDL = await generateBaselineDDL(config.schemaPath, schemasToImport, localDbUrl);
      spinner.succeed("Baseline DDL generated");

      // Clear migrations directory and reset committed state
      if (existsSync(migrationsDir)) {
        const entries = await fs.readdir(migrationsDir);
        for (const entry of entries) {
          if (entry.endsWith(".sql")) {
            await fs.unlink(path.join(migrationsDir, entry));
          }
        }
      }
      await saveCommittedState({migrations: []});

      const schemaLabel = schemasToImport.join(", ");
      const migrationFile = await createMigrationFile(
        migrationName,
        `-- Baseline import\n-- Schemas: ${schemaLabel}\n-- Imported at: ${new Date().toISOString()}\n\n${baselineDDL}`,
        "-- WARNING: Automatic rollback of a full baseline import is not supported.\n-- Manual intervention required to undo all imported objects.",
        getCommittedMigrationsPath(),
      );

      logger.success(`Baseline migration created: ${migrationFile.name}`);
      logger.debug(`  Path: ${migrationFile.path}`, options.verbose);

      await addCommittedMigration({
        migrationFile: {
          name: migrationFile.name,
          path: toRelativePath(migrationFile.path),
          timestamp: migrationFile.timestamp,
        },
        description: `Baseline import (${schemaLabel})`,
        sessionMigrations: [],
        committedAt: new Date().toISOString(),
      });

      // Step 8: Apply to local database
      logger.step(8, 8, "Applying to local database...");

      spinner.start("Creating local database...");
      try {
        await createDatabase(localDbUrl);
        spinner.succeed("Local database created");
      } catch {
        spinner.warn("Local database may already exist — continuing");
      }

      spinner.start("Applying infrastructure SQL to local database...");
      try {
        await applyInfraToDatabase(localDbUrl);
        spinner.succeed("Infrastructure SQL applied");
      } catch {
        spinner.warn("Could not apply infrastructure SQL — continuing");
      }

      spinner.start("Applying baseline migration to local database...");
      const migrateResult = await runCommittedMigrate(localDbUrl);
      if (migrateResult.success) {
        spinner.succeed("Baseline migration applied to local database");
      } else {
        spinner.warn("Could not apply baseline migration to local database");
        logger.warn(`  ${migrateResult.output}`);
      }

      logger.step(8, 8, "Syncing migration state...");
      spinner.start("Inserting migration tracking record...");
      try {
        await syncMigrationState(targetUrl, migrationFile.timestamp);
        spinner.succeed("Migration tracking record inserted");
      } catch (error) {
        spinner.warn("Could not insert migration tracking record");
        logger.warn(`  ${error instanceof Error ? error.message : String(error)}`);
        logger.warn("  The baseline migration file was created but the source database may not recognize it.");
        logger.warn("  You may need to manually insert the record into schema_migrations.");
      }
    }

    // Cleanup
    if (!options.dryRun) {
      if (existsSync(tmpDir)) {
        await fs.rm(tmpDir, {recursive: true, force: true});
      }
      await deletePlanFile();
      await deleteGeneratedSchema();
      await cleanupContainer();
    }

    logger.blank();
    logger.success("Database import complete!");
    logger.blank();
    logger.info("What was created:");
    logger.info(`  - Schema files in ${config.schemaPath} (normalized from database dump)`);
    logger.info(`  - Infra files in ${config.infraPath} (roles, extensions, schemas)`);
    logger.info(`  - Baseline migration in ${getCommittedMigrationsPath()}`);
    logger.info("  - Local database set up with imported schema");
    logger.blank();
    logger.info("Next steps:");
    logger.info(`  1. Review the schema files in ${config.schemaPath}`);
    logger.info('  2. Add a remote: postkit db remote add <name> <url>');
    logger.info('  3. Start working: modify schema files, then "postkit db plan" to see changes');
  } catch (error) {
    spinner.fail("Import failed");
    await cleanupContainer();
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
