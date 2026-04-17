import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("fs/promises", async () => {
  const {vi} = await import("vitest");
  const fns = {mkdir: vi.fn(), writeFile: vi.fn(), readFile: vi.fn()};
  return {default: fns, ...fns};
});

vi.mock("fs", async () => {
  const {vi} = await import("vitest");
  const fns = {existsSync: vi.fn()};
  return {default: fns, ...fns};
});

import fs from "fs/promises";
import {existsSync} from "fs";
import {getAdminToken, exportRealm, cleanRealmConfig, saveRawExport} from "../../../../src/modules/auth/services/keycloak";

describe("keycloak", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAdminToken()", () => {
    it("returns access_token on success", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({access_token: "tok123"}),
        text: () => Promise.resolve(""),
      });
      vi.stubGlobal("fetch", mockFetch);
      const token = await getAdminToken("http://kc:8080", "admin", "admin");
      expect(token).toBe("tok123");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/realms/master/protocol/openid-connect/token"),
        expect.objectContaining({method: "POST"}),
      );
    });

    it("throws on non-OK response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false, status: 401, text: () => Promise.resolve("Unauthorized"),
      }));
      await expect(getAdminToken("http://kc:8080", "admin", "wrong")).rejects.toThrow("401");
    });

    it("throws when response missing access_token", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, json: () => Promise.resolve({}),
      }));
      await expect(getAdminToken("http://kc:8080", "admin", "admin")).rejects.toThrow("access_token");
    });
  });

  describe("exportRealm()", () => {
    it("returns realm data on success", async () => {
      const realmData = {realm: "test", enabled: true};
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, json: () => Promise.resolve(realmData),
      }));
      const result = await exportRealm("http://kc:8080", "test", "token123");
      expect(result.realm).toBe("test");
    });

    it("throws on export failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false, status: 500, text: () => Promise.resolve("Internal Error"),
      }));
      await expect(exportRealm("http://kc:8080", "test", "token")).rejects.toThrow("export failed");
    });
  });

  describe("cleanRealmConfig()", () => {
    it("removes users", () => {
      const cleaned = cleanRealmConfig({users: [{username: "admin"}]} as any);
      expect((cleaned as any).users).toBeUndefined();
    });

    it("removes client secrets", () => {
      const cleaned = cleanRealmConfig({clients: [{clientId: "app", secret: "abc"}]} as any);
      expect(cleaned.clients![0].secret).toBeUndefined();
    });

    it("strips id fields recursively", () => {
      const cleaned = cleanRealmConfig({id: "123", nested: {id: "456", name: "test"}} as any);
      expect((cleaned as any).id).toBeUndefined();
      expect((cleaned as any).nested.id).toBeUndefined();
      expect((cleaned as any).nested.name).toBe("test");
    });

    it("removes SMTP password", () => {
      const cleaned = cleanRealmConfig({smtpServer: {password: "secret", host: "smtp"}} as any);
      expect((cleaned as any).smtpServer.password).toBeUndefined();
    });
  });

  describe("saveRawExport()", () => {
    it("creates directory and writes file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();
      await saveRawExport({realm: "test"} as any, "/project/.postkit/auth/raw/test.json");
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});
