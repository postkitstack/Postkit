import fs from "fs";
import path from "path";
import ora from "ora";
import {logger} from "../common/logger";
import {promptConfirm} from "../common/prompt";
import {
  projectRoot,
  POSTKIT_CONFIG_FILE,
  POSTKIT_SECRETS_FILE,
  POSTKIT_DIR,
  getConfigFilePath,
  getSecretsFilePath,
  getPostkitDir,
  getPostkitAuthDir,
  getStackDir,
} from "../common/config";
import type {CommandOptions} from "../common/types";
import type {PostkitPublicConfig, PostkitSecrets} from "../common/config";

// Ephemeral/user-specific files are gitignored; committed migrations and auth state are tracked.
// postkit.config.json is safe to commit.
const GITIGNORE_ENTRIES = [
  "# Postkit",
  ".postkit/db/session.json",
  ".postkit/db/plan.sql",
  ".postkit/db/schema.sql",
  ".postkit/db/session/",
  ".postkit/stack/",
  "postkit.secrets.json",
];

// Non-sensitive settings committed to git — no remotes (user/env-specific, lives in secrets)
const SCAFFOLD_PUBLIC_CONFIG: PostkitPublicConfig = {
  db: {
    schemaPath: "schema",
    schema: "public",
  },
  auth: {
    configCliImage: "adorsys/keycloak-config-cli:6.4.0-24",
  },
  stack: {},
};

// Sensitive credentials — gitignored
const SCAFFOLD_SECRETS: PostkitSecrets = {
  db: {
    localDbUrl: "",
    remotes: {},
  },
  auth: {
    source: {
      url: "",
      adminUser: "",
      adminPass: "",
      realm: "",
    },
    target: {
      url: "",
      adminUser: "",
      adminPass: "",
    },
  },
  stack: {},
};

// Example secrets template committed alongside the public config
const SCAFFOLD_SECRETS_EXAMPLE: PostkitSecrets = {
  db: {
    localDbUrl: "postgres://user:pass@localhost:5432/mydb",
    remotes: {
      dev: {
        url: "postgres://user:pass@dev-host:5432/mydb",
      },
    },
  },
  auth: {
    source: {
      url: "http://keycloak-source:8080",
      adminUser: "admin",
      adminPass: "changeme",
      realm: "myrealm",
    },
    target: {
      url: "http://keycloak-target:8080",
      adminUser: "admin",
      adminPass: "changeme",
    },
  },
  stack: {
    postgres: {
      user: "postgres",
      password: "changeme",
    },
    keycloak: {
      adminUser: "admin",
      adminPassword: "changeme",
    },
    postgrest: {
      jwtSecret: "changeme-to-a-long-random-secret",
    },
  },
};

export async function initCommand(options: CommandOptions): Promise<void> {
  logger.heading("Postkit Init");

  const postkitDir = getPostkitDir();
  const configFile = getConfigFilePath();
  const alreadyInitialized =
    fs.existsSync(postkitDir) || fs.existsSync(configFile);

  if (alreadyInitialized && !options.force) {
    logger.warn("Postkit is already initialized in this directory.");

    if (options.dryRun) {
      logger.info("Dry run: would prompt for overwrite confirmation.");
      return;
    }

    const confirmed = await promptConfirm(
      "Overwrite existing configuration?",
      {default: false, force: options.force},
    );

    if (!confirmed) {
      logger.info("Init cancelled.");
      return;
    }
  }

  const totalSteps = 6;

  // Step 1: Create .postkit/db/ directory
  logger.step(1, totalSteps, "Creating .postkit/db/ directory");
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_DIR}/db/`);
  } else {
    const spinner = ora("Creating .postkit/db/ directory...").start();
    const postkitDbDir = path.join(postkitDir, "db");
    fs.mkdirSync(postkitDbDir, {recursive: true});
    // session.json is intentionally excluded — created only when a session starts
    const runtimeFiles: Record<string, string> = {
      "committed.json": JSON.stringify({migrations: []}, null, 2),
      "plan.sql": "",
      "schema.sql": "",
    };
    for (const [file, content] of Object.entries(runtimeFiles)) {
      const filePath = path.join(postkitDbDir, file);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content);
      }
    }
    for (const subdir of ["session", "migrations"]) {
      const subPath = path.join(postkitDbDir, subdir);
      if (!fs.existsSync(subPath)) {
        fs.mkdirSync(subPath, {recursive: true});
      }
    }
    spinner.succeed(".postkit/db/ directory created");
  }

  // Step 2: Create .postkit/auth/ directory
  logger.step(2, totalSteps, "Creating .postkit/auth/ directory");
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_DIR}/auth/`);
  } else {
    const spinner = ora("Creating .postkit/auth/ directory...").start();
    const postkitAuthDir = getPostkitAuthDir();
    for (const subdir of ["raw", "realm"]) {
      const subPath = path.join(postkitAuthDir, subdir);
      if (!fs.existsSync(subPath)) {
        fs.mkdirSync(subPath, {recursive: true});
      }
    }
    spinner.succeed(".postkit/auth/ directory created");
  }

  // Step 3: Create .postkit/stack/ directory
  logger.step(3, totalSteps, "Creating .postkit/stack/ directory");
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_DIR}/stack/`);
  } else {
    const spinner = ora("Creating .postkit/stack/ directory...").start();
    const stackDir = getStackDir();
    fs.mkdirSync(stackDir, {recursive: true});
    spinner.succeed(".postkit/stack/ directory created");
  }

  // Step 4: Generate config and secrets files
  logger.step(4, totalSteps, "Generating config and secrets files");
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_CONFIG_FILE} (committed) and ${POSTKIT_SECRETS_FILE} (gitignored)`);
  } else {
    const spinner = ora("Writing config files...").start();

    fs.writeFileSync(configFile, JSON.stringify(SCAFFOLD_PUBLIC_CONFIG, null, 2) + "\n");

    const secretsFile = getSecretsFilePath();
    fs.writeFileSync(secretsFile, JSON.stringify(SCAFFOLD_SECRETS, null, 2) + "\n");

    // Write example secrets template so teammates know the expected shape
    const exampleFile = path.join(projectRoot, "postkit.secrets.example.json");
    fs.writeFileSync(exampleFile, JSON.stringify(SCAFFOLD_SECRETS_EXAMPLE, null, 2) + "\n");

    spinner.succeed(`${POSTKIT_CONFIG_FILE}, ${POSTKIT_SECRETS_FILE}, and postkit.secrets.example.json created`);
  }

  // Step 5: Update .gitignore
  logger.step(5, totalSteps, "Updating .gitignore");
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (options.dryRun) {
    logger.info("Dry run: would update .gitignore with Postkit entries");
  } else {
    const spinner = ora("Updating .gitignore...").start();
    let existingContent = "";
    if (fs.existsSync(gitignorePath)) {
      existingContent = fs.readFileSync(gitignorePath, "utf-8");
    }

    const missingEntries = GITIGNORE_ENTRIES.filter(
      (entry) => !existingContent.includes(entry),
    );

    if (missingEntries.length > 0) {
      const suffix = existingContent.length > 0 && !existingContent.endsWith("\n")
        ? "\n"
        : "";
      const separator = existingContent.length > 0 ? "\n" : "";
      fs.appendFileSync(gitignorePath, suffix + separator + missingEntries.join("\n") + "\n");
      spinner.succeed(".gitignore updated");
    } else {
      spinner.succeed(".gitignore already up to date");
    }
  }

  // Step 6: Summary
  logger.step(6, totalSteps, "Done");
  logger.blank();
  logger.success("Postkit project initialized!");
  logger.blank();
  logger.info("What gets committed to git:");
  logger.info(`  ${POSTKIT_CONFIG_FILE}         — schema paths, project settings`);
  logger.info(`  postkit.secrets.example.json  — secrets template for teammates`);
  logger.info(`  .postkit/db/migrations/       — committed migration SQL files`);
  logger.info(`  .postkit/db/committed.json    — migration tracking index`);
  logger.info(`  .postkit/auth/                — auth realm and raw config`);
  logger.blank();
  logger.info("What is gitignored:");
  logger.info(`  ${POSTKIT_SECRETS_FILE}        — DB URLs, remotes, passwords`);
  logger.info(`  .postkit/db/session.json      — active session state`);
  logger.info(`  .postkit/db/plan.sql          — generated diff (ephemeral)`);
  logger.info(`  .postkit/db/schema.sql        — generated schema (ephemeral)`);
  logger.info(`  .postkit/db/session/          — temporary session migrations`);
  logger.blank();
  logger.info("Next steps:");
  logger.info(`  1. Fill in ${POSTKIT_SECRETS_FILE} with your database credentials`);
  logger.info("  2. Add remote databases:");
  logger.info("     postkit db remote add staging \"postgres://...\"");
  logger.info("  3. Start the local backend stack:");
  logger.info("     postkit stack up");
  logger.info("  4. Or run postkit db start to begin a migration session");
}
