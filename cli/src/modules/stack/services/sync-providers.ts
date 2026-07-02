import fs from "fs";
import path from "path";
import type {Ora} from "ora";
import {cliRoot, projectRoot, getPostkitAuthDir} from "../../../common/config";

export function getProvidersDir(): string {
  return path.join(getPostkitAuthDir(), "providers");
}

/**
 * Copy Keycloak provider JARs into .postkit/auth/providers/ from two sources:
 *  1. cli/vendor/providers/  — bundled JARs shipped with PostKit
 *  2. auth/providers/<name>/target/  — project-specific JARs built locally
 * The dest dir is mounted into the Keycloak container at /opt/keycloak/providers.
 */
export function syncKeycloakProviders(spinner?: Ora): void {
  const destDir = getProvidersDir();
  fs.mkdirSync(destDir, {recursive: true});

  const copied: string[] = [];

  // Source 1: bundled vendor JARs
  const vendorProvidersDir = path.join(cliRoot, "vendor", "providers");
  if (fs.existsSync(vendorProvidersDir)) {
    for (const file of fs.readdirSync(vendorProvidersDir)) {
      if (!file.endsWith(".jar")) continue;
      fs.copyFileSync(path.join(vendorProvidersDir, file), path.join(destDir, file));
      copied.push(file);
    }
  }

  // Source 2: project-specific JARs from auth/providers/<name>/target/
  const projectProvidersDir = path.join(projectRoot, "auth", "providers");
  if (fs.existsSync(projectProvidersDir)) {
    for (const providerDir of fs.readdirSync(projectProvidersDir)) {
      const targetDir = path.join(projectProvidersDir, providerDir, "target");
      if (!fs.existsSync(targetDir)) continue;
      for (const file of fs.readdirSync(targetDir)) {
        if (!file.endsWith(".jar")) continue;
        fs.copyFileSync(path.join(targetDir, file), path.join(destDir, file));
        copied.push(file);
      }
    }
  }

  if (copied.length > 0 && spinner) {
    spinner.succeed(`Keycloak providers synced: ${copied.join(", ")}`);
  }
}
