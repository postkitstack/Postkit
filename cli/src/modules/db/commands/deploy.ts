import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../../../common/logger";
import {getConfig} from "../utils/db-config";
import {hasActiveSession, deleteSession} from "../utils/session";
import {deletePlanFile} from "../services/pgschema";
import {deleteGeneratedSchema} from "../services/schema-generator";
import {
  testConnection,
  cloneDatabase,
  dropDatabase,
  getTableCount,
} from "../services/database";
import {runDbmateMigrate} from "../services/dbmate";
import {generateInfra, applyInfra} from "../services/infra-generator";
import {generateGrants, applyGrants} from "../services/grant-generator";
import {generateSeeds, applySeeds} from "../services/seed-generator";
import {getPendingCommittedMigrations, markMigrationDeployed} from "../utils/committed";
import type {CommandOptions} from "../../../common/types";
import type {Config} from "../types/index";

interface DeployOptions extends CommandOptions {
  target?: string;
  url?: string;
}

function resolveTargetUrl(options: DeployOptions, config: Config): {url: string; label: string} {
  if (options.url) {
    return {url: options.url, label: "direct URL"};
  }

  if (!options.target) {
    throw new Error(
      "Either --target or --url is required.\n" +
      "Usage:\n" +
      '  postkit db deploy --target=staging\n' +
      '  postkit db deploy --url=postgres://...',
    );
  }

  const envUrl = config.environments[options.target];

  if (!envUrl) {
    const available = Object.keys(config.environments).filter(
      (key) => !!config.environments[key],
    );
    const availableStr = available.length > 0
      ? `Available environments: ${available.join(", ")}`
      : "No environments configured in postkit.config.json";

    const exists = options.target in config.environments;
    const message = exists
      ? `Environment "${options.target}" has no URL configured.`
      : `Unknown environment: "${options.target}"`;

    throw new Error(
      `${message}\n${availableStr}\n\n` +
      "Add environment URLs to your postkit.config.json:\n" +
      '  "db": { "environments": { "staging": "postgres://..." } }',
    );
  }

  return {url: envUrl, label: options.target};
}

async function cleanupExistingSession(
  spinner: ReturnType<typeof ora>,
  options: DeployOptions,
): Promise<void> {
  if (!options.force) {
    const {confirm} = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "An active migration session exists. Remove it to continue with deploy?",
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info("Deploy cancelled.");
      process.exit(0);
    }
  }

  spinner.start("Cleaning up existing session...");
  await deletePlanFile();
  await deleteGeneratedSchema();
  await deleteSession();
  spinner.succeed("Existing session removed");
}

async function runSteps(
  dbUrl: string,
  label: string,
  spinner: ReturnType<typeof ora>,
  stepOffset: number,
  totalSteps: number,
  migrationFilter?: string[],
): Promise<void> {
  let step = stepOffset;

  // Infra
  logger.step(step, totalSteps, `Applying infra to ${label}...`);
  const infra = await generateInfra();

  if (infra.length === 0) {
    spinner.info("No infra files found - skipping");
  } else {
    spinner.start(`Applying infra to ${label}...`);
    await applyInfra(dbUrl);
    spinner.succeed(`Infra applied to ${label} (${infra.length} file(s))`);
  }

  step++;

  // Dbmate migrate
  logger.step(step, totalSteps, `Running migrations on ${label}...`);
  spinner.start(`Running dbmate migrate on ${label}...`);
  const migrateResult = await runDbmateMigrate(dbUrl, undefined, migrationFilter);

  if (!migrateResult.success) {
    spinner.fail(`Failed to run migrations on ${label}`);
    throw new Error(migrateResult.output);
  }

  spinner.succeed(`Migrations applied to ${label}`);
  step++;

  // Grants
  logger.step(step, totalSteps, `Applying grants to ${label}...`);
  const grants = await generateGrants();

  if (grants.length === 0) {
    spinner.info("No grant files found - skipping");
  } else {
    spinner.start(`Applying grants to ${label}...`);
    await applyGrants(dbUrl);
    spinner.succeed(`Grants applied to ${label} (${grants.length} file(s))`);
  }

  step++;

  // Seeds
  logger.step(step, totalSteps, `Applying seeds to ${label}...`);
  const seeds = await generateSeeds();

  if (seeds.length === 0) {
    spinner.info("No seed files found - skipping");
  } else {
    spinner.start(`Applying seeds to ${label}...`);
    await applySeeds(dbUrl);
    spinner.succeed(`Seeds applied to ${label} (${seeds.length} file(s))`);
  }
}

export async function deployCommand(options: DeployOptions): Promise<void> {
  const spinner = ora();

  try {
    const config = getConfig();

    // Step 1: Resolve target URL
    const {url: targetUrl, label: targetLabel} = resolveTargetUrl(options, config);

    logger.heading("Deploy Migrations");
    logger.info(`Target: ${targetLabel}`);
    logger.blank();

    // Step 2: Check for pending committed migrations
    const pendingMigrations = await getPendingCommittedMigrations();

    if (pendingMigrations.length === 0) {
      logger.info("No committed migrations pending deployment.");
      logger.blank();
      logger.info("To commit migrations:");
      logger.info('  1. Run "postkit db start" to begin a session');
      logger.info('  2. Make schema changes or run "postkit db plan"');
      logger.info('  3. Run "postkit db apply" to test locally');
      logger.info('  4. Run "postkit db commit" to commit migrations');
      logger.blank();
      return;
    }

    logger.info(`Found ${pendingMigrations.length} committed migration(s) to deploy:`);
    for (const cm of pendingMigrations) {
      logger.info(`  - ${cm.migrationFile.name} (${cm.description})`);
    }
    logger.blank();

    // Step 3: Check for active session
    const sessionActive = await hasActiveSession();

    if (sessionActive) {
      await cleanupExistingSession(spinner, options);
      logger.blank();
    }

    const totalSteps = 11;
    const migrationNames = pendingMigrations.map(m => m.migrationFile.name);

    // Step 1: Test target DB connection
    logger.step(1, totalSteps, "Testing target database connection...");
    spinner.start("Connecting to target database...");
    const targetConnected = await testConnection(targetUrl);

    if (!targetConnected) {
      spinner.fail("Failed to connect to target database");
      logger.error("Could not connect to the target database. Check your connection URL.");
      process.exit(1);
    }

    const targetTableCount = await getTableCount(targetUrl);
    spinner.succeed(`Connected to target database (${targetTableCount} tables)`);

    // Step 2: Clone target DB to local
    const localDbUrl = config.localDbUrl;

    logger.step(2, totalSteps, "Cloning target database to local...");
    spinner.start("Cloning target database to local for dry-run verification...");
    await cloneDatabase(targetUrl, localDbUrl);
    const localTableCount = await getTableCount(localDbUrl);
    spinner.succeed(`Target cloned to local (${localTableCount} tables)`);

    // Steps 3-6: Dry run on local clone
    logger.blank();
    logger.heading("Dry Run (local verification)");

    try {
      await runSteps(localDbUrl, "local clone", spinner, 3, totalSteps, migrationNames);
    } catch (error) {
      spinner.fail("Dry run failed on local clone");
      logger.error(error instanceof Error ? error.message : String(error));
      logger.blank();

      // Clean up local clone
      logger.info("Cleaning up local clone...");
      try {
        await dropDatabase(localDbUrl);
      } catch {
        // Best effort cleanup
      }

      logger.error("Deployment aborted — dry run failed. No changes were made to the target database.");
      process.exit(1);
    }

    logger.blank();
    logger.success("Dry run passed!");
    logger.blank();

    // Confirm deployment
    if (!options.force) {
      const {confirm} = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Deploy to ${targetLabel}? This will apply ${pendingMigrations.length} migration(s) to the target database.`,
          default: false,
        },
      ]);

      if (!confirm) {
        logger.info("Deploy cancelled.");
        // Clean up local clone
        try {
          await dropDatabase(localDbUrl);
        } catch {
          // Best effort cleanup
        }
        return;
      }
    }

    // Steps 7-10: Apply to target
    logger.blank();
    logger.heading("Deploying to Target");

    try {
      await runSteps(targetUrl, targetLabel, spinner, 7, totalSteps, migrationNames);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      logger.blank();
      logger.error("Target deployment failed. The target database may be in a partial state.");
      logger.info("Investigate and fix manually, then retry: postkit db deploy");

      // Clean up local clone
      try {
        await dropDatabase(localDbUrl);
      } catch {
        // Best effort
      }

      process.exit(1);
    }

    // Step 11: Mark migrations as deployed
    logger.step(11, totalSteps, "Marking migrations as deployed...");
    spinner.start("Updating committed state...");

    for (const migration of pendingMigrations) {
      await markMigrationDeployed(migration.migrationFile.name);
    }

    spinner.succeed(`${pendingMigrations.length} migration(s) marked as deployed`);

    // Drop local clone
    logger.blank();
    logger.step(12, 12, "Cleaning up local clone...");
    spinner.start("Dropping local clone database...");

    try {
      await dropDatabase(localDbUrl);
      spinner.succeed("Local clone database dropped");
    } catch (error) {
      spinner.warn("Failed to drop local clone (non-fatal): " + (error instanceof Error ? error.message : String(error)));
    }

    // Report success
    logger.blank();
    logger.success(`Deployment to ${targetLabel} completed successfully!`);
    logger.blank();
    logger.info(`Deployed ${pendingMigrations.length} migration(s):`);
    for (const cm of pendingMigrations) {
      logger.info(`  ✓ ${cm.migrationFile.name} - ${cm.description}`);
    }
    logger.blank();
  } catch (error) {
    spinner.fail("Deployment failed");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
