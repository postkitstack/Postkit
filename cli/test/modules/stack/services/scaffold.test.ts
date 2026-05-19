import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/common/config", () => ({
  projectRoot: "/project",
  cliRoot: "/cli",
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import fs from "fs";
import {scaffoldRealmTemplate} from "../../../../src/modules/stack/services/scaffold";

describe("scaffoldRealmTemplate()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the realm file and returns true when file does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = scaffoldRealmTemplate();

    expect(result).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
  });

  it("creates parent directories if missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    scaffoldRealmTemplate();

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(".postkit/auth/realm"),
      {recursive: true},
    );
  });

  it("writes file at path containing DEFAULT_REALM_TEMPLATE_PATH segments", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    scaffoldRealmTemplate();

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const writtenPath = writeCall[0] as string;
    expect(writtenPath).toContain(".postkit");
    expect(writtenPath).toContain("auth");
    expect(writtenPath).toContain("realm");
    expect(writtenPath).toContain("postkit.json");
  });

  it("writes valid JSON content containing realm template structure", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    scaffoldRealmTemplate();

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const content = writeCall[1] as string;
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty("realm");
    expect(parsed).toHaveProperty("enabled");
    expect(parsed).toHaveProperty("clients");
    expect(parsed).toHaveProperty("roles");
  });

  it("skips write and returns false when file already exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = scaffoldRealmTemplate();

    expect(result).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("always calls mkdirSync even when file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    scaffoldRealmTemplate();

    expect(fs.mkdirSync).toHaveBeenCalledOnce();
  });
});
