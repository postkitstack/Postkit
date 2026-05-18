import ora from "ora";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getStackConfig, ensureStackSecrets, getComposeFilePath} from "../utils/stack-config";
import {checkDockerComposeAvailable, composeUp} from "../services/docker-compose";
import {writeComposeFile, getSelectedServices} from "../services/compose";
import type {ServiceName} from "../services/compose";
import {waitForAllServices} from "../services/health";
import {applyStackDeploy} from "../services/db-init";
import {readStackIsInitial, setStackInitialized} from "../utils/stack-state";

export interface UpOptions extends CommandOptions {
  wait?: boolean;
  keysRun?: boolean;
}

export async function upCommand(
  options: UpOptions,
  services: string[] = [],
): Promise<void> {
  logger.heading("PostKit Stack Up");

  // Step 1: Check Docker + Compose availability
  const spinner = ora("Checking Docker...").start();
  await checkDockerComposeAvailable();
  spinner.succeed("Docker and Docker Compose available");

  // Step 2: Load config and ensure secrets
  let config = getStackConfig();
  config = ensureStackSecrets(config);

  // Step 3: Resolve which services to start
  const selected = getSelectedServices(config, services);
  const serviceList = selected.join(", ");

  // Step 4: Generate compose file
  const composeSpinner = ora(`Generating docker-compose.yml for: ${serviceList}`).start();
  const composeFile = writeComposeFile(config, selected);
  composeSpinner.succeed(`Compose file written to .postkit/stack/docker-compose.yml`);

  // Step 5: Start infrastructure services first (postgres + traefik)
  const infraServices = (["postgres", "traefik"] as ServiceName[]).filter((s) => selected.includes(s));
  const infraList = infraServices.join(", ");
  const infraSpinner = ora(`Starting infrastructure: ${infraList}`).start();
  const infraResult = await composeUp(composeFile, infraServices);

  if (infraResult.exitCode !== 0) {
    infraSpinner.fail("Failed to start infrastructure services");
    logger.error(infraResult.stderr);
    logger.info("Run 'postkit stack logs' for details.");
    return;
  }
  infraSpinner.succeed(`Infrastructure started: ${infraList}`);

  // Step 6: Wait for infrastructure to be healthy
  if (options.wait !== false && infraServices.length > 0) {
    const healthSpinner = ora("Waiting for infrastructure to become healthy...").start();
    try {
      await waitForAllServices(config, infraServices, healthSpinner);
      healthSpinner.succeed("Infrastructure healthy");
    } catch (error) {
      healthSpinner.warn(String((error as Error).message));
      logger.warn("Infrastructure may still be starting. Attempting DB init anyway...");
    }
  }

  // Step 7: Apply DB infra + committed migrations (no dry-run)
  if (infraServices.includes("postgres")) {
    const dbDeploySpinner = ora("Deploying DB (infra + migrations)...").start();
    try {
      await applyStackDeploy(config, dbDeploySpinner);
    } catch (error) {
      dbDeploySpinner.warn(`DB deploy skipped: ${(error as Error).message}`);
    }
  }

  // Step 8: Start all remaining selected services
  const remainingServices = selected.filter((s) => !infraServices.includes(s));
  if (remainingServices.length > 0) {
    const upSpinner = ora(`Starting services: ${serviceList}`).start();
    const result = await composeUp(composeFile, selected);
    if (result.exitCode !== 0) {
      upSpinner.fail("Failed to start services");
      logger.error(result.stderr);
      logger.info("Run 'postkit stack logs' for details.");
      return;
    }
    upSpinner.succeed(`Services started: ${serviceList}`);
  }

  // Step 9: Health checks for all services
  if (options.wait !== false) {
    const healthSpinner = ora("Waiting for all services to become healthy...").start();
    try {
      await waitForAllServices(config, selected, healthSpinner);
      healthSpinner.succeed("All services healthy");
    } catch (error) {
      healthSpinner.warn(String((error as Error).message));
      logger.warn("Some services may still be starting. Check with 'postkit stack status'.");
    }
  }

  // Step 7: Initial setup — realm import + JWKs fetch
  // Only runs when is_initial != 'false' in postkit.stack_config.
  // Skipped on normal restarts. Resets automatically when DB volumes are wiped.
  if (selected.includes("keycloak")) {
    const isInitial = await readStackIsInitial(config);

    if (isInitial) {
      // Step 7a: Import realm template (must run before JWKs fetch)
      if (config.keycloak.realmTemplate) {
        const realmSpinner = ora("Importing realm template into Keycloak...").start();
        try {
          const {importRealmTemplate} = await import("../services/realm-init");
          await importRealmTemplate(config, realmSpinner);
          realmSpinner.succeed(`Realm "${config.keycloak.realm}" imported`);
        } catch (error) {
          realmSpinner.warn(`Realm import failed: ${(error as Error).message}`);
          logger.warn("Run 'postkit stack init' to retry.");
        }
      }

      // Step 7b: Fetch JWKs and client credentials — realm must exist first
      if (options.keysRun !== false) {
        const keysSpinner = ora("Fetching JWKs and client credentials from Keycloak...").start();
        try {
          const {fetchAndMergeKeys, writeKeysToSecrets} = await import("../services/keycloak-keys");
          const result = await fetchAndMergeKeys(config, keysSpinner);
          writeKeysToSecrets(result);
          // Regenerate compose with new jwks and recreate postgrest
          if (selected.includes("postgrest")) {
            const updatedConfig = getStackConfig();
            const newComposeFile = writeComposeFile(updatedConfig, selected);
            await composeUp(newComposeFile, ["postgrest"]);
          }
          keysSpinner.succeed("Keycloak JWKs fetched and PostgREST updated");
        } catch (error) {
          keysSpinner.warn(`Could not fetch Keycloak keys: ${(error as Error).message}`);
          logger.warn("Run 'postkit stack keys' after Keycloak is configured.");
        }
      }

      // Mark stack as initialized — subsequent stack up skips realm import + JWKs
      await setStackInitialized(config);
    } else {
      logger.info("Stack already initialized. Run 'postkit stack init' to re-run realm import.");
    }
  }

  // Step 9: Print summary
  logger.blank();
  logger.success("Stack is running!");
  logger.blank();
  logger.table(
    ["Service", "URL", "Port"],
    selected.map((s) => {
      switch (s) {
        case "postgres":
          return ["PostgreSQL", `postgres://${config.postgres.user}:***@localhost:${config.postgres.port}/${config.postgres.database}`, String(config.postgres.port)];
        case "keycloak":
          return ["Keycloak", `http://keycloak.localhost`, `${config.traefik.httpPort} (Traefik)`];
        case "postgrest":
          return ["PostgREST", `http://api.localhost`, `${config.traefik.httpPort} (Traefik)`];
        case "traefik":
          return ["Traefik", `http://localhost:${config.traefik.dashboardPort}/dashboard/`, String(config.traefik.dashboardPort)];
        default:
          return [s, "", ""];
      }
    }),
  );
  logger.blank();
  logger.info("Useful commands:");
  logger.info("  postkit stack status    — Check service health");
  logger.info("  postkit stack logs      — Tail service logs");
  logger.info("  postkit stack down      — Stop all services");
}
