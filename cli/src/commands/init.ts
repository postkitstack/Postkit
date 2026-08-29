import crypto from "crypto";
import fs from "fs";
import path from "path";
import ora from "ora";
import {logger} from "../common/logger";
import {promptConfirm, promptInput} from "../common/prompt";
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
import {scaffoldDbInfra, scaffoldStorageMigration} from "../modules/db/services/scaffold";
import {scaffoldRealmTemplate, DEFAULT_REALM_TEMPLATE_PATH} from "../modules/stack/services/scaffold";
import {syncKeycloakProviders} from "../modules/stack/services/sync-providers";

const VALID_MODULES = ["db", "auth", "stack"] as const;
type InitModule = (typeof VALID_MODULES)[number];

// Ephemeral/user-specific files are gitignored; committed migrations and auth state are tracked.
// postkit.config.json is safe to commit.
const SHARED_GITIGNORE_ENTRIES = ["# Postkit", "postkit.secrets.json"];
const DB_GITIGNORE_ENTRIES = [
  ".postkit/db/session.json",
  ".postkit/db/plan_*.sql",
  ".postkit/db/schema_*.sql",
  ".postkit/db/session/",
];
const AUTH_GITIGNORE_ENTRIES = [".postkit/auth/providers/"];
const STACK_GITIGNORE_ENTRIES = [".postkit/stack/"];

// Non-sensitive settings committed to git — no remotes (user/env-specific, lives in secrets)
const SCAFFOLD_PUBLIC_CONFIG: PostkitPublicConfig = {
  db: {
    schemaPath: "db/schema",
    schemas: ["public"],
    infraPath: "db/infra",
  },
  auth: {
    configCliImage: "adorsys/keycloak-config-cli:latest-26",
  },
  stack: {
    keycloak: {
      realmTemplate: DEFAULT_REALM_TEMPLATE_PATH,
    },
  },
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
  },
};

/**
 * Write postkit.config.json / postkit.secrets.json / postkit.secrets.example.json.
 * Config always gets the full db+auth+stack shape, regardless of which module
 * triggered the write — config loaders for db/auth throw on a missing section,
 * so a partial config would break other modules the moment they're used later.
 */
function writeProjectConfig(projectName: string): void {
  const publicConfig: PostkitPublicConfig = {...SCAFFOLD_PUBLIC_CONFIG, name: projectName};
  fs.writeFileSync(getConfigFilePath(), JSON.stringify(publicConfig, null, 2) + "\n");
  fs.writeFileSync(getSecretsFilePath(), JSON.stringify(SCAFFOLD_SECRETS, null, 2) + "\n");

  const exampleFile = path.join(projectRoot, "postkit.secrets.example.json");
  fs.writeFileSync(exampleFile, JSON.stringify(SCAFFOLD_SECRETS_EXAMPLE, null, 2) + "\n");
}

/**
 * Ensure postkit.config.json/postkit.secrets.json exist, only prompting for and
 * generating a project name when the config file doesn't exist yet. Never
 * overwrites an existing config — used by scoped (`init <module>`) runs so
 * running one module's init after another never clobbers the project.
 */
async function ensureProjectConfigExists(options: CommandOptions): Promise<void> {
  const configFile = getConfigFilePath();

  if (fs.existsSync(configFile)) {
    return;
  }

  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_CONFIG_FILE} and ${POSTKIT_SECRETS_FILE}`);
    return;
  }

  const rawName = await promptInput("Project name:", {
    required: true,
    force: options.force,
  });
  const randomId = crypto.randomBytes(4).toString("hex");
  const projectName = `${rawName.trim().toLowerCase().replace(/\s+/g, "-")}_${randomId}`;
  logger.info(`Project ID: ${projectName}`);

  const spinner = ora("Writing config files...").start();
  writeProjectConfig(projectName);
  spinner.succeed(`${POSTKIT_CONFIG_FILE}, ${POSTKIT_SECRETS_FILE}, and postkit.secrets.example.json created`);
}

function scaffoldDbFiles(options: CommandOptions): void {
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_DIR}/db/, db/infra/*.sql, and the storage.migrations migration`);
    return;
  }

  const spinner = ora("Creating .postkit/db/ directory...").start();
  const postkitDbDir = path.join(getPostkitDir(), "db");
  fs.mkdirSync(postkitDbDir, {recursive: true});
  // session.json, plan_*.sql, schema_*.sql are intentionally excluded — created on demand
  const committedFilePath = path.join(postkitDbDir, "committed.json");
  if (!fs.existsSync(committedFilePath)) {
    fs.writeFileSync(committedFilePath, JSON.stringify({migrations: []}, null, 2));
  }
  for (const subdir of ["session", "migrations"]) {
    const subPath = path.join(postkitDbDir, subdir);
    if (!fs.existsSync(subPath)) {
      fs.mkdirSync(subPath, {recursive: true});
    }
  }
  spinner.succeed(".postkit/db/ directory created");

  const infraSpinner = ora("Creating db/infra/roles.sql...").start();
  const infraCreated = scaffoldDbInfra();
  infraSpinner.succeed(infraCreated ? "db/infra/roles.sql created" : "db/infra/roles.sql already exists — skipped");
}

async function scaffoldDbMigration(options: CommandOptions): Promise<void> {
  if (options.dryRun) {
    logger.info("Dry run: would create committed migration for storage.migrations table");
    return;
  }

  const spinner = ora("Creating storage.migrations init migration...").start();
  const created = await scaffoldStorageMigration();
  spinner.succeed(
    created
      ? "storage.migrations init migration created"
      : "storage.migrations init migration already exists — skipped",
  );
}

function createAuthDir(options: CommandOptions): void {
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_DIR}/auth/`);
    return;
  }

  const spinner = ora("Creating .postkit/auth/ directory...").start();
  const postkitAuthDir = getPostkitAuthDir();
  for (const subdir of ["raw", "realm", "providers"]) {
    const subPath = path.join(postkitAuthDir, subdir);
    if (!fs.existsSync(subPath)) {
      fs.mkdirSync(subPath, {recursive: true});
    }
  }
  // Copy bundled Keycloak provider JARs from cli/vendor/providers/
  syncKeycloakProviders();
  spinner.succeed(".postkit/auth/ directory created");
}

function scaffoldRealmTemplateStep(options: CommandOptions): void {
  if (options.dryRun) {
    logger.info(`Dry run: would create ${DEFAULT_REALM_TEMPLATE_PATH}`);
    return;
  }

  const spinner = ora(`Creating ${DEFAULT_REALM_TEMPLATE_PATH}...`).start();
  const created = scaffoldRealmTemplate();
  spinner.succeed(created ? `${DEFAULT_REALM_TEMPLATE_PATH} created` : `${DEFAULT_REALM_TEMPLATE_PATH} already exists — skipped`);
}

function scaffoldAuthFiles(options: CommandOptions): void {
  createAuthDir(options);
  scaffoldRealmTemplateStep(options);
}

function scaffoldStackFiles(options: CommandOptions): void {
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_DIR}/stack/`);
    return;
  }

  const spinner = ora("Creating .postkit/stack/ directory...").start();
  fs.mkdirSync(getStackDir(), {recursive: true});
  spinner.succeed(".postkit/stack/ directory created");
}

function updateGitignore(entries: string[], options: CommandOptions): void {
  if (options.dryRun) {
    logger.info("Dry run: would update .gitignore with Postkit entries");
    return;
  }

  const spinner = ora("Updating .gitignore...").start();
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let existingContent = "";
  if (fs.existsSync(gitignorePath)) {
    existingContent = fs.readFileSync(gitignorePath, "utf-8");
  }

  const missingEntries = entries.filter((entry) => !existingContent.includes(entry));

  if (missingEntries.length > 0) {
    const suffix = existingContent.length > 0 && !existingContent.endsWith("\n") ? "\n" : "";
    const separator = existingContent.length > 0 ? "\n" : "";
    fs.appendFileSync(gitignorePath, suffix + separator + missingEntries.join("\n") + "\n");
    spinner.succeed(".gitignore updated");
  } else {
    spinner.succeed(".gitignore already up to date");
  }
}

export async function initCommand(options: CommandOptions, module?: string): Promise<void> {
  if (module && !VALID_MODULES.includes(module as InitModule)) {
    logger.error(`Unknown module: "${module}". Available modules: ${VALID_MODULES.join(", ")}`);
    return;
  }

  if (module) {
    await initModuleCommand(options, module as InitModule);
    return;
  }

  await initFullCommand(options);
}

async function initFullCommand(options: CommandOptions): Promise<void> {
  logger.heading("Postkit Init");

  // Prompt for project name — required
  const rawName = await promptInput("Project name:", {
    required: true,
    force: options.force,
  });
  const randomId = crypto.randomBytes(4).toString("hex");
  const projectName = `${rawName.trim().toLowerCase().replace(/\s+/g, "-")}_${randomId}`;
  logger.info(`Project ID: ${projectName}`);

  const postkitDir = getPostkitDir();
  const configFile = getConfigFilePath();
  const alreadyInitialized = fs.existsSync(postkitDir) || fs.existsSync(configFile);

  if (alreadyInitialized && !options.force) {
    logger.warn("Postkit is already initialized in this directory.");

    if (options.dryRun) {
      logger.info("Dry run: would prompt for overwrite confirmation.");
      return;
    }

    const confirmed = await promptConfirm("Overwrite existing configuration?", {
      default: false,
      force: options.force,
    });

    if (!confirmed) {
      logger.info("Init cancelled.");
      return;
    }
  }

  const totalSteps = 8;

  logger.step(1, totalSteps, "Creating .postkit/db/ directory");
  scaffoldDbFiles(options);

  logger.step(2, totalSteps, "Creating .postkit/auth/ directory");
  createAuthDir(options);

  logger.step(3, totalSteps, "Creating .postkit/stack/ directory");
  scaffoldStackFiles(options);

  logger.step(4, totalSteps, "Generating config and secrets files");
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_CONFIG_FILE} (committed) and ${POSTKIT_SECRETS_FILE} (gitignored)`);
  } else {
    const spinner = ora("Writing config files...").start();
    writeProjectConfig(projectName);
    spinner.succeed(`${POSTKIT_CONFIG_FILE}, ${POSTKIT_SECRETS_FILE}, and postkit.secrets.example.json created`);
  }

  logger.step(5, totalSteps, "Scaffolding db/infra/roles.sql and storage.migrations");
  await scaffoldDbMigration(options);

  logger.step(6, totalSteps, "Scaffolding realm template");
  scaffoldRealmTemplateStep(options);

  logger.step(7, totalSteps, "Updating .gitignore");
  updateGitignore(
    [...SHARED_GITIGNORE_ENTRIES, ...DB_GITIGNORE_ENTRIES, ...AUTH_GITIGNORE_ENTRIES, ...STACK_GITIGNORE_ENTRIES],
    options,
  );

  logger.step(8, totalSteps, "Done");
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
  logger.info(`  .postkit/db/plan_*.sql        — generated diffs (ephemeral, per schema)`);
  logger.info(`  .postkit/db/schema_*.sql      — generated schemas (ephemeral, per schema)`);
  logger.info(`  .postkit/db/session/          — temporary session migrations`);
  logger.info(`  .postkit/auth/providers/      — synced Keycloak provider JARs`);
  logger.blank();
  logger.info("Next steps:");
  logger.info(`  1. Fill in ${POSTKIT_SECRETS_FILE} with your database credentials`);
  logger.info("  2. Add remote databases:");
  logger.info("     postkit db remote add staging \"postgres://...\"");
  logger.info("  3. Start the local backend stack:");
  logger.info("     postkit stack up");
  logger.info("  4. Or run postkit db start to begin a migration session");
}

async function initModuleCommand(options: CommandOptions, module: InitModule): Promise<void> {
  logger.heading(`Postkit Init (${module})`);

  const totalSteps = 3;

  logger.step(1, totalSteps, "Ensuring project config exists");
  await ensureProjectConfigExists(options);

  logger.step(2, totalSteps, `Scaffolding ${module} module`);
  switch (module) {
    case "db":
      scaffoldDbFiles(options);
      break;
    case "auth":
      scaffoldAuthFiles(options);
      break;
    case "stack":
      scaffoldStackFiles(options);
      break;
  }

  logger.step(3, totalSteps, "Updating .gitignore");
  const entries = {
    db: [...SHARED_GITIGNORE_ENTRIES, ...DB_GITIGNORE_ENTRIES],
    auth: [...SHARED_GITIGNORE_ENTRIES, ...AUTH_GITIGNORE_ENTRIES],
    stack: [...SHARED_GITIGNORE_ENTRIES, ...STACK_GITIGNORE_ENTRIES],
  }[module];
  updateGitignore(entries, options);

  logger.blank();
  logger.success(`Postkit ${module} module initialized!`);
  logger.blank();
  logger.info("Next steps:");
  if (module === "db") {
    logger.info("  postkit db remote add staging \"postgres://...\"");
    logger.info("  postkit db start");
  } else if (module === "auth") {
    logger.info("  postkit auth export / import / sync");
  } else {
    logger.info("  postkit stack up");
  }
}
