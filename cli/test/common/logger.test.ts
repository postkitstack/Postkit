import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {logger} from "../../src/common/logger";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("info() outputs with blue prefix", () => {
    logger.info("hello world");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("info");
    expect(output).toContain("hello world");
  });

  it("success() outputs with green prefix", () => {
    logger.success("done");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("success");
    expect(output).toContain("done");
  });

  it("warn() outputs with yellow prefix", () => {
    logger.warn("careful");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("warn");
    expect(output).toContain("careful");
  });

  it("error() outputs with red prefix", () => {
    logger.error("fail");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("error");
    expect(output).toContain("fail");
  });

  it("debug() outputs when verbose is true", () => {
    logger.debug("detail", true);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("debug");
    expect(output).toContain("detail");
  });

  it("debug() is silent when verbose is false", () => {
    logger.debug("detail", false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("debug() is silent when verbose is undefined", () => {
    logger.debug("detail");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("step() shows [n/total] format", () => {
    logger.step(2, 5, "applying migration");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("[2/5]");
    expect(output).toContain("applying migration");
  });

  it("blank() outputs empty line", () => {
    logger.blank();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]!.length).toBe(0);
  });

  it("box() draws box with border chars", () => {
    logger.box("hello");
    // box draws: top border, content line, bottom border = 3 calls
    expect(logSpy).toHaveBeenCalledTimes(3);
    const topBorder = logSpy.mock.calls[0]!.join("");
    const content = logSpy.mock.calls[1]!.join("");
    const bottomBorder = logSpy.mock.calls[2]!.join("");
    expect(topBorder).toContain("┌");
    expect(topBorder).toContain("┐");
    expect(content).toContain("hello");
    expect(content).toContain("│");
    expect(bottomBorder).toContain("└");
    expect(bottomBorder).toContain("┘");
  });

  it("box() handles multi-line content", () => {
    logger.box("line1\nline2");
    // top border, 2 content lines, bottom border = 4 calls
    expect(logSpy).toHaveBeenCalledTimes(4);
    const content1 = logSpy.mock.calls[1]!.join("");
    const content2 = logSpy.mock.calls[2]!.join("");
    expect(content1).toContain("line1");
    expect(content2).toContain("line2");
  });

  it("sql() outputs SQL text", () => {
    logger.sql("SELECT 1");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("SELECT 1");
  });

  it("diff() shows + added and - removed lines", () => {
    logger.diff(["added line"], ["removed line"]);
    expect(logSpy).toHaveBeenCalledTimes(2);
    const addedOutput = logSpy.mock.calls[0]![0] as string;
    const removedOutput = logSpy.mock.calls[1]![0] as string;
    expect(addedOutput).toContain("+");
    expect(addedOutput).toContain("added line");
    expect(removedOutput).toContain("-");
    expect(removedOutput).toContain("removed line");
  });

  it("table() formats headers and rows", () => {
    logger.table(["Name", "Type"], [["users", "table"]]);
    // header row, separator, data row = 3 calls
    expect(logSpy).toHaveBeenCalledTimes(3);
    const header = logSpy.mock.calls[0]!.join("");
    const separator = logSpy.mock.calls[1]!.join("");
    const row = logSpy.mock.calls[2]!.join("");
    expect(header).toContain("Name");
    expect(header).toContain("Type");
    expect(separator).toContain("-");
    expect(row).toContain("users");
    expect(row).toContain("table");
  });
});
