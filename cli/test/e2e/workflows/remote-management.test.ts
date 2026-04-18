import {describe, it, expect, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, readJson} from "../helpers/test-project";

describe("Remote management", () => {
  const projects: TestProject[] = [];

  afterAll(async () => {
    for (const p of projects) {
      await cleanupTestProject(p);
    }
  });

  it("lists remotes", async () => {
    const project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
      remoteDbUrl: "postgres://localhost:5432/remote",
      remoteName: "dev",
    });
    projects.push(project);

    const result = await runCli(["db", "remote", "list"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("dev");
  });

  it("adds a new remote", async () => {
    const project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
      remoteDbUrl: "postgres://localhost:5432/remote",
      remoteName: "dev",
    });
    projects.push(project);

    const result = await runCli(
      ["db", "remote", "add", "staging", "postgres://localhost:5432/staging"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);

    // Verify in config file
    const config = await readJson<{
      db: {remotes: Record<string, {url: string}>};
    }>(project, "postkit.config.json");
    expect(config.db.remotes.staging).toBeDefined();
    expect(config.db.remotes.staging.url).toBe("postgres://localhost:5432/staging");
  });

  it("adds a remote with --default flag", async () => {
    const project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
      remoteDbUrl: "postgres://localhost:5432/remote",
      remoteName: "dev",
    });
    projects.push(project);

    const result = await runCli(
      ["db", "remote", "add", "prod", "postgres://localhost:5432/prod", "--default"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);

    const config = await readJson<{
      db: {remotes: Record<string, {url: string; default?: boolean}>};
    }>(project, "postkit.config.json");
    expect(config.db.remotes.prod).toBeDefined();
    expect(config.db.remotes.prod.default).toBe(true);
  });

  it("sets default remote with 'use'", async () => {
    const project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
      remoteDbUrl: "postgres://localhost:5432/remote",
      remoteName: "dev",
    });
    projects.push(project);

    // Add another remote
    await runCli(
      ["db", "remote", "add", "staging", "postgres://localhost:5432/staging"],
      {cwd: project.rootDir},
    );

    // Set staging as default
    const result = await runCli(["db", "remote", "use", "staging"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);

    const config = await readJson<{
      db: {remotes: Record<string, {url: string; default?: boolean}>};
    }>(project, "postkit.config.json");
    expect(config.db.remotes.staging.default).toBe(true);
  });

  it("removes a remote with --force", async () => {
    const project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
      remoteDbUrl: "postgres://localhost:5432/remote",
      remoteName: "dev",
    });
    projects.push(project);

    // Add a second remote
    await runCli(
      ["db", "remote", "add", "staging", "postgres://localhost:5432/staging"],
      {cwd: project.rootDir},
    );

    // Remove staging
    const result = await runCli(["db", "remote", "remove", "staging", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);

    const config = await readJson<{
      db: {remotes: Record<string, unknown>};
    }>(project, "postkit.config.json");
    expect(config.db.remotes.staging).toBeUndefined();
  });
});
