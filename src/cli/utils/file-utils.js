const fs = require("fs-extra");
const path = require("path");
const mustache = require("mustache");
const logger = require("./logger");

class FileUtils {
  async copyTemplate(sourcePath, targetPath, variables = {}) {
    logger.startSpinner(`Copying template files...`);

    try {
      await fs.ensureDir(path.dirname(targetPath));

      if (await fs.pathExists(sourcePath)) {
        const stats = await fs.stat(sourcePath);

        if (stats.isDirectory()) {
          await this.copyDirectoryWithTemplating(
            sourcePath,
            targetPath,
            variables
          );
        } else {
          await this.copyFileWithTemplating(sourcePath, targetPath, variables);
        }

        logger.stopSpinner("Template files copied successfully");
      } else {
        throw new Error(`Source path does not exist: ${sourcePath}`);
      }
    } catch (error) {
      logger.stopSpinner("Failed to copy template files", false);
      throw error;
    }
  }

  async copyTemplateFiltered(sourcePath, targetPath, variables = {}) {
    logger.startSpinner(`Copying template files...`);

    try {
      await fs.ensureDir(path.dirname(targetPath));

      if (await fs.pathExists(sourcePath)) {
        const stats = await fs.stat(sourcePath);

        if (stats.isDirectory()) {
          await this.copyDirectoryWithTemplatingFiltered(
            sourcePath,
            targetPath,
            variables
          );
        } else {
          if (!this.shouldSkipFile(sourcePath)) {
            await this.copyFileWithTemplating(
              sourcePath,
              targetPath,
              variables
            );
          }
        }

        logger.stopSpinner("Template files copied successfully");
      } else {
        throw new Error(`Source path does not exist: ${sourcePath}`);
      }
    } catch (error) {
      logger.stopSpinner("Failed to copy template files", false);
      throw error;
    }
  }

  async copyDirectoryWithTemplatingFiltered(sourceDir, targetDir, variables) {
    await fs.ensureDir(targetDir);
    const items = await fs.readdir(sourceDir);

    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const targetPath = path.join(targetDir, item);
      const stats = await fs.stat(sourcePath);

      if (stats.isDirectory()) {
        await this.copyDirectoryWithTemplatingFiltered(
          sourcePath,
          targetPath,
          variables
        );
      } else {
        if (!this.shouldSkipFile(sourcePath)) {
          await this.copyFileWithTemplating(sourcePath, targetPath, variables);
        }
      }
    }
  }

  shouldSkipFile(filePath) {
    const fileName = path.basename(filePath);
    const skipPatterns = [
      /\.template$/,
      /^docker-compose.*\.yml$/,
      /^docker-compose.*\.yaml$/,
      /\.DS_Store$/,
      /^\.gitkeep$/,
      /\.env\.example$/,
      /^example\.env$/,
      /^readMe\.md$/i,
      /^README\.md$/i,
    ];

    return skipPatterns.some((pattern) => pattern.test(fileName));
  }

  async copyDirectoryWithTemplating(sourceDir, targetDir, variables) {
    await fs.ensureDir(targetDir);
    const items = await fs.readdir(sourceDir);

    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const targetPath = path.join(targetDir, item);
      const stats = await fs.stat(sourcePath);

      if (stats.isDirectory()) {
        await this.copyDirectoryWithTemplating(
          sourcePath,
          targetPath,
          variables
        );
      } else {
        await this.copyFileWithTemplating(sourcePath, targetPath, variables);
      }
    }
  }

  async copyFileWithTemplating(sourceFile, targetFile, variables) {
    await fs.ensureDir(path.dirname(targetFile));

    // Skip mustache processing for binary files
    if (this.isBinaryFile(sourceFile)) {
      await fs.copyFile(sourceFile, targetFile);
      return;
    }

    const content = await fs.readFile(sourceFile, "utf8");
    const processedContent = mustache.render(content, variables);

    await fs.writeFile(targetFile, processedContent);
  }

  isBinaryFile(filePath) {
    const binaryExtensions = [
      ".jar",
      ".war",
      ".class",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".ico",
      ".svg",
      ".pdf",
      ".zip",
      ".tar",
      ".gz",
      ".rar",
      ".7z",
      ".mp3",
      ".mp4",
      ".avi",
      ".mov",
      ".wav",
      ".ttf",
      ".otf",
      ".woff",
      ".woff2",
      ".bin",
      ".dat",
      ".db",
      ".sqlite",
    ];

    const ext = path.extname(filePath).toLowerCase();
    return binaryExtensions.includes(ext);
  }

  async createProjectStructure(projectPath, projectName) {
    const directories = [
      "db/migrations",
      "auth/config",
      "auth/providers/out",
      "functions",
      "storage/migrations",
      "worker/src/tasks",
      "worker/src/services",
      "worker/src/types",
      "scripts",
      "volumes/storage",
    ];

    logger.startSpinner("Creating project structure...");

    try {
      for (const dir of directories) {
        await fs.ensureDir(path.join(projectPath, dir));
      }

      // Generate .gitignore file
      await this.generateGitignore(projectPath);

      logger.stopSpinner("Project structure created");
    } catch (error) {
      logger.stopSpinner("Failed to create project structure", false);
      throw error;
    }
  }

  async generateGitignore(projectPath) {
    const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs
*.log

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# Docker volumes
volumes/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# Build outputs
dist/
build/
*.tgz

# Database
*.sqlite
*.db

# Temporary files
tmp/
temp/
`;

    await fs.writeFile(path.join(projectPath, ".gitignore"), gitignoreContent);
  }

  async generateEnvFile(targetPath, variables) {
    const envTemplate = `# PostKit Environment Configuration
# Generated by PostKit CLI

# Database Configuration
POSTGRES_DB={{projectName}}_db
POSTGRES_USER={{dbUser}}
POSTGRES_PASSWORD={{dbPassword}}
DATABASE_URL=postgres://{{dbUser}}:{{dbPassword}}@db:5432/{{projectName}}_db?sslmode=disable

# JWT Configuration
JWT_SECRET={{jwtSecret}}
ANON_KEY={{anonKey}}
SERVICE_ROLE_KEY={{serviceRoleKey}}

# Storage Configuration
STORAGE_URL_SIGNING_KEY={{storageSigningKey}}

# Keycloak Configuration
KEYCLOAK_ADMIN={{keycloakAdmin}}
KEYCLOAK_ADMIN_PASSWORD={{keycloakAdminPassword}}

# Application Configuration
NODE_ENV={{nodeEnv}}
PORT={{port}}
`;

    const processedContent = mustache.render(envTemplate, variables);
    await fs.writeFile(targetPath, processedContent);
  }

  generateRandomKey(length = 64) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async fileExists(filePath) {
    return fs.pathExists(filePath);
  }

  async readJsonFile(filePath) {
    return fs.readJson(filePath);
  }

  async writeJsonFile(filePath, data) {
    return fs.writeJson(filePath, data, {spaces: 2});
  }
}

module.exports = new FileUtils();
