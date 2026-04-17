import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";

vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("../../src/common/logger", () => ({
  logger: {info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn()},
}));

import {isInteractive, promptConfirm, promptInput} from "../../src/common/prompt";
import inquirer from "inquirer";

describe("prompt", () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
  });

  describe("isInteractive()", () => {
    it("returns true when stdin.isTTY is true", () => {
      process.stdin.isTTY = true;
      expect(isInteractive()).toBe(true);
    });

    it("returns false when stdin.isTTY is undefined", () => {
      process.stdin.isTTY = undefined;
      expect(isInteractive()).toBe(false);
    });
  });

  describe("promptConfirm()", () => {
    it("returns true with force flag in TTY", async () => {
      process.stdin.isTTY = true;
      const result = await promptConfirm("Continue?", {force: true});
      expect(result).toBe(true);
    });

    it("returns true in non-TTY with default true", async () => {
      process.stdin.isTTY = undefined;
      const result = await promptConfirm("Continue?", {default: true});
      expect(result).toBe(true);
    });

    it("throws in non-TTY without force and default false", async () => {
      process.stdin.isTTY = undefined;
      await expect(promptConfirm("Continue?")).rejects.toThrow("Cannot prompt");
    });

    it("uses inquirer in TTY mode", async () => {
      process.stdin.isTTY = true;
      vi.mocked(inquirer.prompt).mockResolvedValue({result: true});
      const result = await promptConfirm("Continue?");
      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });
  });

  describe("promptInput()", () => {
    it("returns default value with force flag", async () => {
      process.stdin.isTTY = true;
      const result = await promptInput("Name?", {force: true, default: "mydb"});
      expect(result).toBe("mydb");
    });

    it("returns empty string with force flag and no default", async () => {
      process.stdin.isTTY = true;
      const result = await promptInput("Name?", {force: true});
      expect(result).toBe("");
    });

    it("throws in non-TTY when required with no default", async () => {
      process.stdin.isTTY = undefined;
      await expect(promptInput("Name?", {required: true})).rejects.toThrow("Non-interactive mode");
    });

    it("uses inquirer in TTY mode", async () => {
      process.stdin.isTTY = true;
      vi.mocked(inquirer.prompt).mockResolvedValue({result: "input_value"});
      const result = await promptInput("Name?");
      expect(result).toBe("input_value");
    });
  });
});
