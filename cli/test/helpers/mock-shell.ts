import {vi} from "vitest";
import type {ShellResult} from "../../src/common/types";

/**
 * Creates a mock ShellResult for a successful command.
 */
export function mockShellSuccess(stdout = "", stderr = ""): ShellResult {
  return {stdout, stderr, exitCode: 0};
}

/**
 * Creates a mock ShellResult for a failed command.
 */
export function mockShellFailure(stderr = "", exitCode = 1): ShellResult {
  return {stdout: "", stderr, exitCode};
}

/**
 * Creates mock implementations for shell functions.
 */
export function createMockShell() {
  return {
    runCommand: vi.fn<() => Promise<ShellResult>>().mockResolvedValue(mockShellSuccess()),
    runSpawnCommand: vi.fn<() => Promise<ShellResult>>().mockResolvedValue(mockShellSuccess()),
    runPipedCommands: vi.fn<() => Promise<ShellResult>>().mockResolvedValue(mockShellSuccess()),
    commandExists: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  };
}
