import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";

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
 * Create an isolated temp project directory with all PostKit scaffolding.
 * The CLI resolves `projectRoot` from `process.cwd()`, so tests must
 * pass `cwd: project.rootDir` when spawning CLI commands.
 */
export async function createTestProject(
  config: CreateTestProjectOptions,
): Promise<TestProject> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "postkit-e2e-"));
  const postkitDir = path.join(rootDir, ".postkit");
  const dbDir = path.join(postkitDir, "db");
  const schemaPath = path.join(rootDir, config.schemaPath ?? "schema");

  // Create directory structure
  await fs.mkdir(dbDir, {recursive: true});
  await fs.mkdir(path.join(dbDir, "session"), {recursive: true});
  await fs.mkdir(path.join(dbDir, "migrations"), {recursive: true});
  await fs.mkdir(schemaPath, {recursive: true});

  // Write runtime files (matching what `postkit init` creates)
  await fs.writeFile(
    path.join(dbDir, "committed.json"),
    JSON.stringify({migrations: []}, null, 2),
  );
  await fs.writeFile(path.join(dbDir, "plan.sql"), "");
  await fs.writeFile(path.join(dbDir, "schema.sql"), "");

  // Write postkit.config.json
  const remoteName = config.remoteName ?? "test-remote";
  const postkitConfig = {
    db: {
      localDbUrl: config.localDbUrl,
      schemaPath: config.schemaPath ?? "schema",
      schema: "public",
      remotes: config.remoteDbUrl
        ? {
            [remoteName]: {
              url: config.remoteDbUrl,
              default: true,
              addedAt: new Date().toISOString(),
            },
          }
        : {},
    },
    auth: {
      source: {url: "", adminUser: "", adminPass: "", realm: ""},
      target: {url: "", adminUser: "", adminPass: ""},
    },
  };

  await fs.writeFile(
    path.join(rootDir, "postkit.config.json"),
    JSON.stringify(postkitConfig, null, 2),
  );

  return {rootDir, configPath: path.join(rootDir, "postkit.config.json"), postkitDir, dbDir, schemaPath};
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
