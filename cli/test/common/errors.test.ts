import {describe, it, expect} from "vitest";
import {PostkitError} from "../../src/common/errors";

describe("PostkitError", () => {
  it("constructs with message only", () => {
    const error = new PostkitError("something went wrong");
    expect(error.message).toBe("something went wrong");
    expect(error.hint).toBeUndefined();
    expect(error.exitCode).toBe(1);
  });

  it("constructs with message and hint", () => {
    const error = new PostkitError("fail", "try doing X instead");
    expect(error.message).toBe("fail");
    expect(error.hint).toBe("try doing X instead");
    expect(error.exitCode).toBe(1);
  });

  it("constructs with custom exit code", () => {
    const error = new PostkitError("fail", undefined, 42);
    expect(error.exitCode).toBe(42);
  });

  it("sets name to PostkitError", () => {
    const error = new PostkitError("fail");
    expect(error.name).toBe("PostkitError");
  });

  it("is an instance of Error", () => {
    const error = new PostkitError("fail");
    expect(error).toBeInstanceOf(Error);
  });
});
