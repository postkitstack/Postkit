import ora from "ora";
import {logger} from "../../../common/logger";
import type {CommandOptions} from "../../../common/types";
import {getStackConfig, ensureStackSecrets, getComposeFilePath} from "../utils/stack-config";
import {checkDockerComposeAvailable, composeUp} from "../services/docker-compose";
import {writeComposeFile, getSelectedServices} from "../services/compose";
import {waitForAllServices} from "../services/health";

export interface UpOptions extends CommandOptions {
  wait?: boolean;
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

  // Step 5: Start services
  const upSpinner = ora(`Starting services: ${serviceList}`).start();
  const result = await composeUp(composeFile, selected);

  if (result.exitCode !== 0) {
    upSpinner.fail("Failed to start services");
    logger.error(result.stderr);
    logger.info("Run 'postkit stack logs' for details.");
    return;
  }
  upSpinner.succeed(`Services started: ${serviceList}`);

  // Step 6: Health checks
  if (options.wait !== false) {
    const healthSpinner = ora("Waiting for services to become healthy...").start();
    try {
      await waitForAllServices(config, selected, healthSpinner);
      healthSpinner.succeed("All services healthy");
    } catch (error) {
      healthSpinner.warn(String((error as Error).message));
      logger.warn("Some services may still be starting. Check with 'postkit stack status'.");
    }
  }

  // Step 7: Print summary
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
