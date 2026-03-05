import {runCommand, commandExists} from "../../../common/shell";
import type {AuthConfig} from "../utils/auth-config";

export async function checkDockerInstalled(): Promise<boolean> {
  return commandExists("docker");
}

export async function importRealm(config: AuthConfig): Promise<void> {
  const dockerInstalled = await checkDockerInstalled();
  if (!dockerInstalled) {
    throw new Error(
      "Docker is required for import but not found. Install Docker first.",
    );
  }

  const command = [
    "docker run --rm",
    "--network host",
    "--platform=linux/amd64",
    `-e KEYCLOAK_URL="${config.targetUrl}/"`,
    `-e KEYCLOAK_USER="${config.targetAdminUser}"`,
    `-e KEYCLOAK_PASSWORD="${config.targetAdminPass}"`,
    `-e KEYCLOAK_AVAILABILITYCHECK_ENABLED=true`,
    `-e KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s`,
    `-e IMPORT_FILES_LOCATIONS="/config/realm.json"`,
    `-v "${config.cleanFilePath}:/config/realm.json"`,
    `"${config.configCliImage}"`,
  ].join(" ");

  const result = await runCommand(command);

  if (result.exitCode !== 0) {
    throw new Error(
      `keycloak-config-cli import failed:\n${result.stderr || result.stdout}`,
    );
  }
}
