import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import {runCli} from "./cli-runner";

export interface TestProject {
  rootDir: string;
  configPath: string;
  postkitDir: string;
  dbDir: string;
  schemaPath: string;  // absolute path to db/schema
  infraPath: string;   // absolute path to db/infra
}

export interface CreateTestProjectOptions {
  localDbUrl?: string;   // omit or pass "" for auto-Docker mode
  remoteDbUrl?: string;
  remoteName?: string;
  schemas?: string[];    // defaults to ["public"] — patch postkit.config.json when provided
}

/**
 * Create an isolated temp project by running `postkit init --force`,
 * then patching the generated config with test-specific DB URLs and remotes.
 *
 * This tests the real init command instead of manually scaffolding files.
 */
export async function createTestProject(
  config: CreateTestProjectOptions,
): Promise<TestProject> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "postkit-e2e-"));

  // Run the real init command
  const result = await runCli(["init", "--force"], {cwd: rootDir});
  if (result.exitCode !== 0) {
    throw new Error(
      `postkit init failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }

  const postkitDir = path.join(rootDir, ".postkit");
  const dbDir = path.join(postkitDir, "db");
  const schemaPath = path.join(rootDir, "db", "schema");
  const infraPath = path.join(rootDir, "db", "infra");
  const configPath = path.join(rootDir, "postkit.config.json");

  // Ensure schema and infra directories exist (init doesn't create them)
  await fs.mkdir(schemaPath, {recursive: true});
  await fs.mkdir(infraPath, {recursive: true});

  // Patch secrets: all credentials and remote data live exclusively in postkit.secrets.json
  const secretsPath = path.join(rootDir, "postkit.secrets.json");
  const remoteName = config.remoteName ?? "test-remote";

  const existingSecrets = JSON.parse(await fs.readFile(secretsPath, "utf-8"));
  existingSecrets.db.localDbUrl = config.localDbUrl ?? "";
  if (config.remoteDbUrl) {
    existingSecrets.db.remotes = {
      [remoteName]: {url: config.remoteDbUrl, default: true, addedAt: new Date().toISOString()},
    };
  }
  await fs.writeFile(secretsPath, JSON.stringify(existingSecrets, null, 2));

  // Patch public config if schemas override provided
  if (config.schemas) {
    const existingConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
    existingConfig.db = existingConfig.db ?? {};
    existingConfig.db.schemas = config.schemas;
    existingConfig.db.schemaPath = "db/schema";
    existingConfig.db.infraPath = "db/infra";
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));
  }

  return {rootDir, configPath, postkitDir, dbDir, schemaPath, infraPath};
}

/**
 * Create an empty temp directory (no PostKit scaffolding).
 * Useful for testing "not initialized" error cases.
 */
export async function createEmptyDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "postkit-e2e-empty-"));
}

/**
 * Remove the entire temp project directory.
 */
export async function cleanupTestProject(project: TestProject): Promise<void> {
  await fs.rm(project.rootDir, {recursive: true, force: true});
}

/**
 * Remove an empty temp directory.
 */
export async function cleanupDir(dir: string): Promise<void> {
  await fs.rm(dir, {recursive: true, force: true});
}

/**
 * Check if a file exists within the project.
 */
export function fileExists(project: TestProject, relativePath: string): boolean {
  return fsSync.existsSync(path.join(project.rootDir, relativePath));
}

/**
 * Read a file within the project as text.
 */
export async function readFile(project: TestProject, relativePath: string): Promise<string> {
  return fs.readFile(path.join(project.rootDir, relativePath), "utf-8");
}

/**
 * Read and parse a JSON file within the project.
 */
export async function readJson<T = unknown>(project: TestProject, relativePath: string): Promise<T> {
  const content = await readFile(project, relativePath);
  return JSON.parse(content) as T;
}

/**
 * Write a file within the project.
 */
export async function writeFile(
  project: TestProject,
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = path.join(project.rootDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), {recursive: true});
  await fs.writeFile(fullPath, content, "utf-8");
}
