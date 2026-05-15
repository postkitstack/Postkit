import ora from "ora";
import type {StackConfig} from "../types/config";
import {applyInfraStep} from "../../db/services/infra-generator";
import {runCommittedMigrate} from "../../db/services/dbmate";

export async function applyStackDeploy(
  config: StackConfig,
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  const pgUrl =
    `postgres://${config.postgres.user}:${encodeURIComponent(config.postgres.password)}` +
    `@localhost:${config.postgres.port}/${config.postgres.database}`;

  // Apply db/infra/*.sql (roles, schemas, extensions)
  await applyInfraStep(spinner, pgUrl, "stack");

  // Apply all committed migrations — no dry-run, no cloning
  spinner.start("Running committed migrations on stack...");
  const result = await runCommittedMigrate(pgUrl);
  if (!result.success) {
    throw new Error(`Migration failed: ${result.output}`);
  }
  spinner.succeed("Committed migrations applied to stack");
}
