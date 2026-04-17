import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../src/common/config", () => ({
  checkInitialized: vi.fn(),
}));

vi.mock("../../src/common/logger", () => ({
  logger: {error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn()},
}));

import {withInitCheck} from "../../src/common/init-check";
import {checkInitialized} from "../../src/common/config";
import {logger} from "../../src/common/logger";
import {PostkitError} from "../../src/common/errors";

describe("withInitCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  it("calls wrapped function when initialized", async () => {
    vi.mocked(checkInitialized).mockImplementation(() => {});
    const fn = vi.fn().mockResolvedValue(undefined);
    await withInitCheck(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("catches PostkitError, logs message and hint, exits", async () => {
    vi.mocked(checkInitialized).mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new PostkitError("something failed", "try this", 2));
    await expect(withInitCheck(fn)).rejects.toThrow("process.exit(2)");
    expect(logger.error).toHaveBeenCalledWith("something failed");
    expect(logger.info).toHaveBeenCalledWith("try this");
  });

  it("re-throws non-PostkitError errors", async () => {
    vi.mocked(checkInitialized).mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new TypeError("unexpected bug"));
    await expect(withInitCheck(fn)).rejects.toThrow("unexpected bug");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("uses default exit code 1 for PostkitError without custom code", async () => {
    vi.mocked(checkInitialized).mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new PostkitError("fail"));
    await expect(withInitCheck(fn)).rejects.toThrow("process.exit(1)");
  });

  it("works with async wrapped functions", async () => {
    vi.mocked(checkInitialized).mockImplementation(() => {});
    const fn = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    await withInitCheck(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
