import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/common/shell", () => ({
  runSpawnCommand: vi.fn(),
  commandExists: vi.fn(),
}));

vi.mock("fs/promises", async () => {
  const {vi} = await import("vitest");
  const fns = {mkdtemp: vi.fn(), writeFile: vi.fn(), rm: vi.fn()};
  return {default: fns, ...fns};
});

import {runSpawnCommand, commandExists} from "../../../../src/common/shell";
import fs from "fs/promises";
import {checkDockerInstalled, importRealm} from "../../../../src/modules/auth/services/importer";

const mockAuthConfig = {
  sourceUrl: "http://source:8080",
  sourceAdminUser: "admin",
  sourceAdminPass: "admin",
  sourceRealm: "test",
  targetUrl: "http://target:8080",
  targetAdminUser: "admin",
  targetAdminPass: "admin",
  configCliImage: "keycloak-config-cli:latest",
  rawFilePath: "/raw/test.json",
  cleanFilePath: "/clean/test.json",
};

describe("importer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkDockerInstalled()", () => {
    it("delegates to commandExists", async () => {
      vi.mocked(commandExists).mockResolvedValue(true);
      expect(await checkDockerInstalled()).toBe(true);
    });
  });

  describe("importRealm()", () => {
    it("throws when Docker not installed", async () => {
      vi.mocked(commandExists).mockResolvedValue(false);
      await expect(importRealm(mockAuthConfig as any)).rejects.toThrow("Docker is required");
    });

    it("runs docker with correct args", async () => {
      vi.mocked(commandExists).mockResolvedValue(true);
      vi.mocked(fs.mkdtemp).mockResolvedValue("/tmp/postkit-keycloak-abc");
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});
      vi.mocked(fs.rm).mockResolvedValue();
      await importRealm(mockAuthConfig as any);
      expect(runSpawnCommand).toHaveBeenCalledTimes(1);
      const args = vi.mocked(runSpawnCommand).mock.calls[0]![0];
      expect(args[0]).toBe("docker");
      expect(args[1]).toBe("run");
    });

    it("cleans up temp dir on failure", async () => {
      vi.mocked(commandExists).mockResolvedValue(true);
      vi.mocked(fs.mkdtemp).mockResolvedValue("/tmp/postkit-keycloak-abc");
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(runSpawnCommand).mockResolvedValue({stdout: "", stderr: "error", exitCode: 1});
      vi.mocked(fs.rm).mockResolvedValue();
      await expect(importRealm(mockAuthConfig as any)).rejects.toThrow("import failed");
      expect(fs.rm).toHaveBeenCalledWith("/tmp/postkit-keycloak-abc", {recursive: true, force: true});
    });
  });
});
