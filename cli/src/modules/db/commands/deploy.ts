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
    const available = Object.keys(config.environments);
    const availableStr = available.length > 0
      ? `Available environments: ${available.join(", ")}`
      : "No environments configured in postkit.config.json";
    throw new Error(
      `Unknown environment: "${options.target}"\n${availableStr}\n\n` +
      "Add environments to your postkit.config.json:\n" +
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
  const migrateResult = await runDbmateMigrate(dbUrl);

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

    // Step 2: Check for active session
    const sessionActive = await hasActiveSession();

    if (sessionActive) {
      await cleanupExistingSession(spinner, options);
      logger.blank();
    }

    // Step 3: Test target DB connection
    logger.step(1, 9, "Testing target database connection...");
    spinner.start("Connecting to target database...");
    const targetConnected = await testConnection(targetUrl);

    if (!targetConnected) {
      spinner.fail("Failed to connect to target database");
      logger.error("Could not connect to the target database. Check your connection URL.");
      process.exit(1);
    }

    const targetTableCount = await getTableCount(targetUrl);
    spinner.succeed(`Connected to target database (${targetTableCount} tables)`);

    // Step 4: Clone target DB to local
    const localDbUrl = config.localDbUrl;

    logger.step(2, 9, "Cloning target database to local...");
    spinner.start("Cloning target database to local for dry-run verification...");
    await cloneDatabase(targetUrl, localDbUrl);
    const localTableCount = await getTableCount(localDbUrl);
    spinner.succeed(`Target cloned to local (${localTableCount} tables)`);

    // Step 5: Dry run on local clone (steps 3-6 of 9)
    logger.blank();
    logger.heading("Dry Run (local verification)");

    try {
      await runSteps(localDbUrl, "local clone", spinner, 3, 9);
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

    // Step 6: Confirm deployment
    if (!options.force) {
      const {confirm} = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Deploy to ${targetLabel}? This will apply migrations to the target database.`,
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

    // Step 7: Apply to target (steps 7-9... but really 4 sub-steps mapped to last steps)
    logger.blank();
    logger.heading("Deploying to Target");

    // We use a simpler step numbering for the target deploy phase
    const targetStepOffset = 7;
    const targetTotalSteps = 9;

    // Infra
    logger.step(targetStepOffset, targetTotalSteps, `Applying infra to ${targetLabel}...`);
    const infra = await generateInfra();

    if (infra.length === 0) {
      spinner.info("No infra files found - skipping");
    } else {
      spinner.start(`Applying infra to ${targetLabel}...`);
      await applyInfra(targetUrl);
      spinner.succeed(`Infra applied to ${targetLabel} (${infra.length} file(s))`);
    }

    // Migrate
    logger.step(targetStepOffset + 1, targetTotalSteps, `Running migrations on ${targetLabel}...`);
    spinner.start(`Running dbmate migrate on ${targetLabel}...`);
    const migrateResult = await runDbmateMigrate(targetUrl);

    if (!migrateResult.success) {
      spinner.fail(`Failed to run migrations on ${targetLabel}`);
      logger.error(migrateResult.output);
      logger.blank();
      logger.error("Target deployment failed during migrations. The target database may be in a partial state.");
      logger.info("Investigate and fix manually, then retry: postkit db deploy");

      // Clean up local clone
      try {
        await dropDatabase(localDbUrl);
      } catch {
        // Best effort
      }

      process.exit(1);
    }

    spinner.succeed(`Migrations applied to ${targetLabel}`);

    // Grants
    const grants = await generateGrants();

    if (grants.length > 0) {
      spinner.start(`Applying grants to ${targetLabel}...`);
      await applyGrants(targetUrl);
      spinner.succeed(`Grants applied to ${targetLabel} (${grants.length} file(s))`);
    }

    // Seeds
    const seeds = await generateSeeds();

    if (seeds.length > 0) {
      spinner.start(`Applying seeds to ${targetLabel}...`);
      await applySeeds(targetUrl);
      spinner.succeed(`Seeds applied to ${targetLabel} (${seeds.length} file(s))`);
    }

    // Step 8: Drop local clone
    logger.step(9, 9, "Cleaning up local clone...");
    spinner.start("Dropping local clone database...");

    try {
      await dropDatabase(localDbUrl);
      spinner.succeed("Local clone database dropped");
    } catch (error) {
      spinner.warn("Failed to drop local clone (non-fatal): " + (error instanceof Error ? error.message : String(error)));
    }

    // Step 9: Report success
    logger.blank();
    logger.success(`Deployment to ${targetLabel} completed successfully!`);
    logger.blank();
  } catch (error) {
    spinner.fail("Deployment failed");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
