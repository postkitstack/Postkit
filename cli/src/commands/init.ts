import fs from "fs";
import path from "path";
import ora from "ora";
import inquirer from "inquirer";
import {logger} from "../common/logger";
import {
  projectRoot,
  POSTKIT_CONFIG_FILE,
  POSTKIT_DIR,
  getConfigFilePath,
  getPostkitDir,
} from "../common/config";
import type {CommandOptions} from "../common/types";
import type {PostkitConfig} from "../common/config";

const GITIGNORE_ENTRIES = [
  "# Postkit",
  ".postkit/",
  "postkit.config.json",
];

const SCAFFOLD_CONFIG: PostkitConfig = {
  db: {
    localDbUrl: "",
    schemaPath: "schema",
    schema: "public",
    pgSchemaBin: "",
    dbmateBin: "",
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
    rawExportDir: ".tmp-config",
    cleanOutputDir: "realm-config",
    outputFilename: "pro-application-realm.json",
    configCliImage: "adorsys/keycloak-config-cli:6.4.0-24",
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

    const {confirm} = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Overwrite existing configuration?",
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info("Init cancelled.");
      return;
    }
  }

  const totalSteps = 4;

  // Step 1: Create .postkit/db/ directory
  logger.step(1, totalSteps, "Creating .postkit/db/ directory");
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_DIR}/db/`);
  } else {
    const spinner = ora("Creating .postkit/db/ directory...").start();
    const postkitDbDir = path.join(postkitDir, "db");
    fs.mkdirSync(postkitDbDir, {recursive: true});
    // Create empty runtime files
    for (const file of ["session.json", "plan.sql", "schema.sql", "committed.json"]) {
      const filePath = path.join(postkitDbDir, file);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "");
      }
    }
    // Create subdirectories
    for (const subdir of ["session", "migrations"]) {
      const subPath = path.join(postkitDbDir, subdir);
      if (!fs.existsSync(subPath)) {
        fs.mkdirSync(subPath, {recursive: true});
      }
    }
    spinner.succeed(".postkit/db/ directory created");
  }

  // Step 2: Generate postkit.config.json
  logger.step(2, totalSteps, "Generating postkit.config.json");
  if (options.dryRun) {
    logger.info(`Dry run: would create ${POSTKIT_CONFIG_FILE}`);
  } else {
    const spinner = ora("Writing postkit.config.json...").start();
    fs.writeFileSync(configFile, JSON.stringify(SCAFFOLD_CONFIG, null, 2) + "\n");
    spinner.succeed("postkit.config.json created");
  }

  // Step 3: Update .gitignore
  logger.step(3, totalSteps, "Updating .gitignore");
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

  // Step 4: Summary
  logger.step(4, totalSteps, "Done");
  logger.blank();
  logger.success("Postkit project initialized!");
  logger.blank();
  logger.info("Next steps:");
  logger.info(`  1. Edit ${POSTKIT_CONFIG_FILE} with your database settings`);
  logger.info("  2. Add remote databases:");
  logger.info("     postkit db remote add staging \"postgres://...\"");
  logger.info("  3. Run postkit db start to begin a migration session");
}
