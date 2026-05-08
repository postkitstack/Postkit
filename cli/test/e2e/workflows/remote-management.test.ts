import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject, readJson} from "../helpers/test-project";

describe("Remote management", () => {
  let project: TestProject;

  beforeAll(async () => {
    project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
      remoteDbUrl: "postgres://localhost:5432/remote",
      remoteName: "dev",
    });
  });

  afterAll(async () => {
    await cleanupTestProject(project);
  });

  it("lists remotes", async () => {
    const result = await runCli(["db", "remote", "list"], {cwd: project.rootDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("dev");
  });

  it("adds a new remote", async () => {
    const result = await runCli(
      ["db", "remote", "add", "staging-add", "postgres://localhost:5432/staging-add"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);

    const secrets = await readJson<{
      db: {remotes: Record<string, {url: string} | undefined>};
    }>(project, "postkit.secrets.json");
    expect(secrets.db.remotes["staging-add"]).toBeDefined();
    expect(secrets.db.remotes["staging-add"]?.url).toBe("postgres://localhost:5432/staging-add");

    // Clean up
    await runCli(["db", "remote", "remove", "staging-add", "--force"], {cwd: project.rootDir});
  });

  it("adds a remote with --default flag", async () => {
    const result = await runCli(
      ["db", "remote", "add", "prod-default", "postgres://localhost:5432/prod-default", "--default"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).toBe(0);

    const secrets = await readJson<{
      db: {remotes: Record<string, {url: string; default?: boolean}>};
    }>(project, "postkit.secrets.json");
    expect(secrets.db.remotes["prod-default"]).toBeDefined();
    expect(secrets.db.remotes["prod-default"]?.default).toBe(true);

    // Restore dev as default and clean up
    await runCli(["db", "remote", "use", "dev"], {cwd: project.rootDir});
    await runCli(["db", "remote", "remove", "prod-default", "--force"], {cwd: project.rootDir});
  });

  it("sets default remote with 'use'", async () => {
    // Add a staging-use remote
    await runCli(
      ["db", "remote", "add", "staging-use", "postgres://localhost:5432/staging-use"],
      {cwd: project.rootDir},
    );

    // Set staging-use as default
    const result = await runCli(["db", "remote", "use", "staging-use"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);

    const secrets = await readJson<{
      db: {remotes: Record<string, {url: string; default?: boolean}>};
    }>(project, "postkit.secrets.json");
    expect(secrets.db.remotes["staging-use"]).toBeDefined();
    expect(secrets.db.remotes["staging-use"]?.default).toBe(true);

    // Restore and clean up
    await runCli(["db", "remote", "use", "dev"], {cwd: project.rootDir});
    await runCli(["db", "remote", "remove", "staging-use", "--force"], {cwd: project.rootDir});
  });

  it("removes a remote with --force", async () => {
    // Add a second remote to remove
    await runCli(
      ["db", "remote", "add", "staging-remove", "postgres://localhost:5432/staging-remove"],
      {cwd: project.rootDir},
    );

    // Remove it
    const result = await runCli(["db", "remote", "remove", "staging-remove", "--force"], {
      cwd: project.rootDir,
    });
    expect(result.exitCode).toBe(0);

    const secrets = await readJson<{
      db: {remotes: Record<string, unknown>};
    }>(project, "postkit.secrets.json");
    expect(secrets.db.remotes["staging-remove"]).toBeUndefined();
  });
});
