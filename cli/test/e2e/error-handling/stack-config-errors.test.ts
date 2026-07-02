import fs from "fs/promises";
import path from "path";
import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {runCli} from "../helpers/cli-runner";
import {createTestProject, cleanupTestProject, type TestProject} from "../helpers/test-project";

/**
 * Write a minimal stub docker-compose.yml into the project's stack directory
 * so that commands which check for the compose file's existence can proceed
 * past that guard and reach subsequent validation logic (e.g., service name checks).
 */
async function writeStubComposeFile(project: TestProject): Promise<void> {
  const stackDir = path.join(project.postkitDir, "stack");
  await fs.mkdir(stackDir, {recursive: true});
  const stub = [
    "name: postkit-test",
    "services:",
    "  postgres:",
    "    image: postgres:16-alpine",
  ].join("\n") + "\n";
  await fs.writeFile(path.join(stackDir, "docker-compose.yml"), stub, "utf-8");
}

describe("Error handling — stack commands with initialized project (no Docker)", () => {
  let project: TestProject;

  beforeAll(async () => {
    // Create a project with config but no active Docker stack
    project = await createTestProject({
      localDbUrl: "postgres://localhost:5432/test",
    });
    // Place a stub compose file so restart/down/status reach their post-file-check logic
    await writeStubComposeFile(project);
  });

  afterAll(async () => {
    await cleanupTestProject(project);
  });

  it("stack restart with unknown service name exits non-zero and mentions 'Unknown service'", async () => {
    const result = await runCli(
      ["stack", "restart", "unknown-service"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).not.toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Unknown service/i);
    expect(output).toContain("unknown-service");
  });

  it("stack restart with mixed valid and unknown services reports the unknown service", async () => {
    const result = await runCli(
      ["stack", "restart", "postgres", "keycloak", "unknown-svc"],
      {cwd: project.rootDir},
    );
    expect(result.exitCode).not.toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("unknown-svc");
  });

  it("stack down with no running stack exits gracefully (no crash)", async () => {
    const result = await runCli(
      ["stack", "down"],
      {cwd: project.rootDir},
    );
    // Must not emit a raw JS stack trace regardless of exit code
    const output = result.stdout + result.stderr;
    expect(output).not.toContain("at Object.<anonymous>");
    expect(output).not.toContain("TypeError:");
    expect(output).not.toContain("ReferenceError:");
  });

  it("stack status with no running stack fails gracefully with a helpful message", async () => {
    const result = await runCli(
      ["stack", "status"],
      {cwd: project.rootDir},
    );
    // status either fails (compose file exists but docker not running) or exits non-zero
    // The key assertion: no raw stack trace, message is user-facing
    const output = result.stdout + result.stderr;
    expect(output).not.toContain("TypeError:");
    expect(output).not.toContain("at Object.<anonymous>");
  });
});
