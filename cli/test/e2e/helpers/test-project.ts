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
  schemaPath: string;
}

export interface CreateTestProjectOptions {
  localDbUrl: string;
  remoteDbUrl?: string;
  remoteName?: string;
  schemaPath?: string;
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
  const schemaPath = path.join(rootDir, config.schemaPath ?? "schema");
  const configPath = path.join(rootDir, "postkit.config.json");

  // Ensure schema directory exists (init doesn't create it)
  await fs.mkdir(schemaPath, {recursive: true});

  // Read the generated config and merge in test-specific values
  const existingConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
  const remoteName = config.remoteName ?? "test-remote";

  existingConfig.db.localDbUrl = config.localDbUrl;
  if (config.remoteDbUrl) {
    existingConfig.db.remotes = {
      [remoteName]: {
        url: config.remoteDbUrl,
        default: true,
        addedAt: new Date().toISOString(),
      },
    };
  }

  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

  return {rootDir, configPath, postkitDir, dbDir, schemaPath};
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
