import {describe, it, expect, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";

describe("Error handling — connection failures", () => {
  const projects: TestProject[] = [];

  afterAll(async () => {
    for (const p of projects) {
      await cleanupTestProject(p);
    }
  });

  it("start fails when remote is unreachable", async () => {
    const project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
      remoteDbUrl: "postgres://nonexistent-host-99999:5432/remote",
      remoteName: "dev",
    });
    projects.push(project);

    const result = await runCli(["db", "start", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/connect|fail|error/i);
  });
});
