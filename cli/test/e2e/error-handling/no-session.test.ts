import {describe, it, expect} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";

describe("Error handling — commands without active session", () => {
  let project: TestProject;

  beforeAll(async () => {
    // Create project with config but no session
    project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/nonexistent",
    });
  });

  afterAll(async () => {
    await cleanupTestProject(project);
  });

  it("plan fails without active session", async () => {
    const result = await runCli(["db", "plan"], {cwd: project.rootDir});
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("No active migration session");
  });

  it("apply fails without active session", async () => {
    const result = await runCli(["db", "apply", "--force"], {cwd: project.rootDir});
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("No active migration session");
  });

  it("commit fails without active session", async () => {
    const result = await runCli(
      ["db", "commit", "--force", "--message", "test"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("No active migration session");
  });

  it("abort gracefully handles no session", async () => {
    const result = await runCli(["db", "abort", "--force"], {cwd: project.rootDir});
    // abort with no session should succeed (idempotent)
    expect(result.stdout).toContain("No active migration session");
  });
});
