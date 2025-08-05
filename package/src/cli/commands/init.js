const path = require("path");
const inquirer = require("inquirer");
const chalk = require("chalk");
const logger = require("../utils/logger");
const fileUtils = require("../utils/file-utils");
const dockerUtils = require("../utils/docker");

async function promptForConfig(projectName, options) {
  logger.info("Configuring your PostKit project...");

  const questions = [
    {
      type: "input",
      name: "dbUser",
      message: "Database username:",
      default: "admin",
    },
    {
      type: "password",
      name: "dbPassword",
      message: "Database password:",
      default: "admin",
    },
    {
      type: "input",
      name: "keycloakAdmin",
      message: "Keycloak admin username:",
      default: "admin",
    },
    {
      type: "password",
      name: "keycloakAdminPassword",
      message: "Keycloak admin password:",
      default: "admin",
    },
    {
      type: "list",
      name: "nodeEnv",
      message: "Environment:",
      choices: ["development", "production"],
      default: "development",
    },
    {
      type: "input",
      name: "port",
      message: "API port:",
      default: "3001",
    },
    {
      type: "confirm",
      name: "installPackages",
      message: "Install npm packages for worker service?",
      default: true,
    },
  ];

  const answers = await inquirer.default.prompt(questions);

  return {
    projectName,
    ...answers,
    withWorker: options.withWorker,
    withStorage: options.withStorage,
    withFunctions: options.withFunctions,
    jwtSecret: fileUtils.generateRandomKey(64),
    anonKey: fileUtils.generateRandomKey(32),
    serviceRoleKey: fileUtils.generateRandomKey(32),
    storageSigningKey: fileUtils.generateRandomKey(32),
  };
}

async function copyProjectTemplate(sourcePath, targetPath, config) {
  logger.startSpinner("Setting up project files...");

  try {
    // Create project structure
    await fileUtils.createProjectStructure(targetPath, config.projectName);

    // Copy template files from src/templates/backend-template/
    const templatePath = path.join(
      sourcePath,
      "src/templates/backend-template"
    );

    // Always copy db to root
    const dbSourcePath = path.join(templatePath, "db");
    const dbTargetPath = path.join(targetPath, "db");
    if (await fileUtils.fileExists(dbSourcePath)) {
      await fileUtils.copyTemplateFiltered(dbSourcePath, dbTargetPath, config);
    }

    // Note: scripts directory not in current template structure

    // Move auth service to root
    const authSourcePath = path.join(templatePath, "services/auth");
    const authTargetPath = path.join(targetPath, "auth");
    if (await fileUtils.fileExists(authSourcePath)) {
      await fileUtils.copyTemplateFiltered(
        authSourcePath,
        authTargetPath,
        config
      );
    }

    // Move pg_rest service to root
    const pgRestSourcePath = path.join(templatePath, "services/pg_rest");
    const pgRestTargetPath = path.join(targetPath, "pg_rest");
    if (await fileUtils.fileExists(pgRestSourcePath)) {
      await fileUtils.copyTemplateFiltered(
        pgRestSourcePath,
        pgRestTargetPath,
        config
      );
    }

    // Conditionally move worker service to root
    if (config.withWorker) {
      const workerSourcePath = path.join(
        templatePath,
        "services/worker-service"
      );
      const workerTargetPath = path.join(targetPath, "worker");

      if (await fileUtils.fileExists(workerSourcePath)) {
        await fileUtils.copyTemplateFiltered(
          workerSourcePath,
          workerTargetPath,
          config
        );
      }
    }

    // Conditionally move storage service to root
    if (config.withStorage) {
      const storageSourcePath = path.join(templatePath, "services/storage");
      const storageTargetPath = path.join(targetPath, "storage");

      if (await fileUtils.fileExists(storageSourcePath)) {
        await fileUtils.copyTemplateFiltered(
          storageSourcePath,
          storageTargetPath,
          config
        );
      }
    }

    // Conditionally move functions service to root
    if (config.withFunctions) {
      const functionsSourcePath = path.join(templatePath, "services/functions");
      const functionsTargetPath = path.join(targetPath, "functions");

      if (await fileUtils.fileExists(functionsSourcePath)) {
        await fileUtils.copyTemplateFiltered(
          functionsSourcePath,
          functionsTargetPath,
          config
        );
      }
    }

    logger.stopSpinner("Project files set up successfully");
  } catch (error) {
    logger.stopSpinner("Failed to set up project files", false);
    throw error;
  }
}

async function generateDockerCompose(targetPath, config) {
  logger.startSpinner("Generating Docker Compose configuration...");

  try {
    const templatePath = path.join(
      __dirname,
      "../../templates/backend-template/docker-compose.template.yml"
    );
    const targetDockerComposePath = path.join(targetPath, "docker-compose.yml");

    await fileUtils.copyTemplate(templatePath, targetDockerComposePath, config);

    logger.stopSpinner("Docker Compose configuration generated");
  } catch (error) {
    logger.stopSpinner(
      "Failed to generate Docker Compose configuration",
      false
    );
    throw error;
  }
}

async function generateEnvironmentFiles(targetPath, config) {
  logger.startSpinner("Generating environment files...");

  try {
    // Generate main .env file from template
    const templatePath = path.join(
      __dirname,
      "../../templates/backend-template/.env.template"
    );
    const mainEnvPath = path.join(targetPath, ".env");
    await fileUtils.copyTemplate(templatePath, mainEnvPath, config);

    // Generate dbmate configuration
    const dbmateTemplatePath = path.join(
      __dirname,
      "../../templates/backend-template/.dbmate.env"
    );
    const dbmatePath = path.join(targetPath, ".dbmate.env");
    await fileUtils.copyTemplate(dbmateTemplatePath, dbmatePath, config);

    logger.stopSpinner("Environment files generated");
  } catch (error) {
    logger.stopSpinner("Failed to generate environment files", false);
    throw error;
  }
}

async function startServices(projectPath, config) {
  if (!dockerUtils.checkDockerInstalled()) {
    logger.warning(
      "Docker or Docker Compose not found. Please install Docker to start services."
    );
    return;
  }

  if (!dockerUtils.isDockerRunning()) {
    logger.warning("Docker is not running. Please start Docker to continue.");
    return;
  }

  logger.info("Starting services with Docker Compose...");

  try {
    // Build services first
    await dockerUtils.buildServices(projectPath);

    // Determine which profiles to activate
    const profiles = [];
    if (config.withWorker) profiles.push("worker");
    if (config.withStorage) profiles.push("storage");
    if (config.withFunctions) profiles.push("functions");

    // Start all services with appropriate profiles
    const startOptions = {
      detached: true,
    };

    if (profiles.length > 0) {
      startOptions.profiles = profiles;
    }

    await dockerUtils.startServices(projectPath, startOptions);

    logger.success("Services started successfully!");
    logger.info("Available services:");
    logger.info("  • Traefik Dashboard: http://traefik.localhost:8080");
    logger.info("  • PostgREST API: http://rest.localhost");
    logger.info("  • Swagger UI: http://swagger.localhost");
    logger.info("  • Keycloak: http://auth.localhost");

    if (config.withWorker) {
      logger.info("  • Graphile Worker: Background job processing active");
    }

    if (config.withFunctions) {
      logger.info("  • Functions Runtime: http://functions.localhost");
    }

    if (config.withStorage) {
      logger.info("  • Storage API: http://storage.localhost");
      logger.info("  • Image Proxy: http://imgproxy.localhost");
    }
  } catch (error) {
    logger.error(`Failed to start services: ${error.message}`);
    throw error;
  }
}

async function installPackages(projectPath, config) {
  if (!config.installPackages || !config.withWorker) {
    return;
  }

  const workerPath = path.join(projectPath, "worker");

  // Check if package.json exists in worker directory
  if (!(await fileUtils.fileExists(path.join(workerPath, "package.json")))) {
    logger.warning(
      "No package.json found in worker directory, skipping package installation"
    );
    return;
  }

  logger.info("Installing npm packages for worker service...");

  try {
    const {spawn} = require("child_process");

    await new Promise((resolve, reject) => {
      const npmInstall = spawn("npm", ["install"], {
        cwd: workerPath,
        stdio: "inherit",
      });

      npmInstall.on("close", (code) => {
        if (code === 0) {
          logger.success("Packages installed successfully!");
          resolve();
        } else {
          reject(new Error(`npm install failed with exit code ${code}`));
        }
      });

      npmInstall.on("error", (error) => {
        reject(new Error(`Failed to run npm install: ${error.message}`));
      });
    });
  } catch (error) {
    logger.error(`Package installation failed: ${error.message}`);
    logger.info("You can manually install packages later by running:");
    logger.info(`  cd ${path.relative(process.cwd(), workerPath)}`);
    logger.info("  npm install");
  }
}

async function initCommand(projectName, options) {
  try {
    logger.header(`Initializing PostKit project: ${chalk.green(projectName)}`);

    const currentDir = process.cwd();
    const projectPath = path.join(currentDir, projectName);

    // Check if project directory already exists
    if (await fileUtils.fileExists(projectPath)) {
      logger.error(`Directory ${projectName} already exists!`);
      process.exit(1);
    }

    // Get configuration from user
    const config = await promptForConfig(projectName, options);

    // Copy project template
    await copyProjectTemplate(__dirname + "/../../../", projectPath, config);

    // Generate Docker Compose file
    await generateDockerCompose(projectPath, config);

    // Generate environment files
    await generateEnvironmentFiles(projectPath, config);

    // Generate README for the new project from template
    const readmeTemplatePath = path.join(
      __dirname,
      "../../templates/backend-template/README.template.md"
    );
    const readmePath = path.join(projectPath, "README.md");
    const readmeConfig = {
      ...config,
      version: require("../../../package.json").version,
    };

    await fileUtils.copyTemplate(readmeTemplatePath, readmePath, readmeConfig);

    logger.success(
      `Project ${chalk.green(projectName)} initialized successfully!`
    );

    // Install packages if requested
    await installPackages(projectPath, config);

    // Start services unless explicitly skipped
    if (!options.skipDocker) {
      await startServices(projectPath, config);
    }

    logger.info(`\nNext steps:`);
    logger.info(`  cd ${projectName}`);
    if (options.skipDocker) {
      logger.info(`  postkit dev`);
    }
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = initCommand;
