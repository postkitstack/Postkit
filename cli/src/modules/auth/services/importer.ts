import {mkdtemp, writeFile, rm} from "fs/promises";
import {tmpdir} from "os";
import path from "path";
import {runSpawnCommand, commandExists} from "../../../common/shell";
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

  // Write credentials to a temp file with restricted permissions (0o600).
  // This keeps them out of the process argument list and away from `ps aux`.
  const tmpDir = await mkdtemp(path.join(tmpdir(), "postkit-keycloak-"));
  const envFile = path.join(tmpDir, "keycloak.env");

  try {
    const envContent = [
      `KEYCLOAK_URL=${config.targetUrl}/`,
      `KEYCLOAK_USER=${config.targetAdminUser}`,
      `KEYCLOAK_PASSWORD=${config.targetAdminPass}`,
      "KEYCLOAK_AVAILABILITYCHECK_ENABLED=true",
      "KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s",
      "IMPORT_FILES_LOCATIONS=/config/realm.json",
    ].join("\n");

    await writeFile(envFile, envContent, {mode: 0o600});

    const result = await runSpawnCommand([
      "docker", "run", "--rm",
      "--network", "host",
      "--platform=linux/amd64",
      "--env-file", envFile,
      "-v", `${config.cleanFilePath}:/config/realm.json`,
      config.configCliImage,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(
        `keycloak-config-cli import failed:\n${result.stderr || result.stdout}`,
      );
    }
  } finally {
    // Always clean up the credentials file, even if the import failed
    await rm(tmpDir, {recursive: true, force: true});
  }
}
