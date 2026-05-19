import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("../../../../src/common/config", () => ({
  projectRoot: "/project",
  cliRoot: "/cli",
}));

vi.mock("../../../../src/common/shell", () => ({
  runSpawnCommand: vi.fn(),
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock("fs/promises", () => ({
  mkdtemp: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
}));

import {cleanRealmTemplate} from "../../../../src/modules/stack/services/realm-init";

const JWT_ROLE_MAPPER_NAME = "JWT Role Mapper";
const BUILTIN_CLIENT_IDS = [
  "account",
  "account-console",
  "admin-cli",
  "broker",
  "realm-management",
  "security-admin-console",
];

function makeRawRealm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "some-uuid-123",
    realm: "original-realm",
    enabled: true,
    clients: [],
    roles: {realm: [], client: {}},
    ...overrides,
  };
}

describe("cleanRealmTemplate()", () => {
  it("sets realm to provided name", () => {
    const raw = makeRawRealm();
    const result = cleanRealmTemplate(raw, "my-realm");
    expect(result.realm).toBe("my-realm");
  });

  it("deletes top-level id", () => {
    const raw = makeRawRealm({id: "some-uuid"});
    const result = cleanRealmTemplate(raw, "test");
    expect(result.id).toBeUndefined();
  });

  it("does not mutate the original input", () => {
    const raw = makeRawRealm({id: "original-id"});
    cleanRealmTemplate(raw, "test");
    expect(raw.id).toBe("original-id");
  });

  describe("client filtering", () => {
    it("filters out all builtin clients", () => {
      const builtinClients = BUILTIN_CLIENT_IDS.map((clientId) => ({clientId, id: "id-" + clientId}));
      const userClient = {clientId: "my-app", id: "user-id"};
      const raw = makeRawRealm({clients: [...builtinClients, userClient]});
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<{clientId: string}>;
      const ids = clients.map((c) => c.clientId);
      for (const builtin of BUILTIN_CLIENT_IDS) {
        expect(ids).not.toContain(builtin);
      }
    });

    it("preserves non-builtin clients", () => {
      const raw = makeRawRealm({
        clients: [
          {clientId: "my-app", id: "user-id"},
          {clientId: "account", id: "builtin-id"},
        ],
      });
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<{clientId: string}>;
      expect(clients.map((c) => c.clientId)).toContain("my-app");
    });

    it("removes id, secret, and registrationAccessToken from non-builtin clients", () => {
      const raw = makeRawRealm({
        clients: [
          {
            clientId: "my-app",
            id: "some-id",
            secret: "super-secret",
            registrationAccessToken: "reg-token",
          },
        ],
      });
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<Record<string, unknown>>;
      expect(clients[0]!.id).toBeUndefined();
      expect(clients[0]!.secret).toBeUndefined();
      expect(clients[0]!.registrationAccessToken).toBeUndefined();
    });

    it("removes client.secret.creation.time from attributes", () => {
      const raw = makeRawRealm({
        clients: [
          {
            clientId: "my-app",
            attributes: {
              "client.secret.creation.time": "12345678",
              "other-attr": "keep-me",
            },
          },
        ],
      });
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<Record<string, unknown>>;
      const attrs = clients[0]!.attributes as Record<string, unknown>;
      expect(attrs["client.secret.creation.time"]).toBeUndefined();
      expect(attrs["other-attr"]).toBe("keep-me");
    });

    it("sets serviceAccountRealmRoles for supabase_service client", () => {
      const raw = makeRawRealm({
        clients: [{clientId: "supabase_service"}],
      });
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<Record<string, unknown>>;
      expect(clients[0]!.serviceAccountRealmRoles).toEqual(["service_role", "app_user"]);
    });

    it("sets serviceAccountRealmRoles for anon client", () => {
      const raw = makeRawRealm({
        clients: [{clientId: "anon"}],
      });
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<Record<string, unknown>>;
      expect(clients[0]!.serviceAccountRealmRoles).toEqual(["anon"]);
    });

    it("injects JWT Role Mapper when absent", () => {
      const raw = makeRawRealm({
        clients: [{clientId: "my-app", protocolMappers: []}],
      });
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<Record<string, unknown>>;
      const mappers = clients[0]!.protocolMappers as Array<{name: string}>;
      expect(mappers.some((m) => m.name === JWT_ROLE_MAPPER_NAME)).toBe(true);
    });

    it("does NOT re-inject JWT Role Mapper when already present (idempotent)", () => {
      const existingMapper = {name: JWT_ROLE_MAPPER_NAME, protocol: "openid-connect"};
      const raw = makeRawRealm({
        clients: [{clientId: "my-app", protocolMappers: [existingMapper]}],
      });
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<Record<string, unknown>>;
      const mappers = clients[0]!.protocolMappers as Array<{name: string}>;
      const jwtMappers = mappers.filter((m) => m.name === JWT_ROLE_MAPPER_NAME);
      expect(jwtMappers).toHaveLength(1);
    });

    it("injects JWT Role Mapper when protocolMappers is absent", () => {
      const raw = makeRawRealm({
        clients: [{clientId: "my-app"}],
      });
      const result = cleanRealmTemplate(raw, "test");
      const clients = result.clients as Array<Record<string, unknown>>;
      const mappers = clients[0]!.protocolMappers as Array<{name: string}>;
      expect(mappers.some((m) => m.name === JWT_ROLE_MAPPER_NAME)).toBe(true);
    });
  });

  describe("realm roles", () => {
    it("creates admin realm role when roles array is empty", () => {
      const raw = makeRawRealm({roles: {realm: [], client: {}}});
      const result = cleanRealmTemplate(raw, "test");
      const roles = (result.roles as {realm: Array<{name: string}>}).realm;
      expect(roles.some((r) => r.name === "admin")).toBe(true);
    });

    it("does NOT duplicate admin role when already present", () => {
      const raw = makeRawRealm({
        roles: {
          realm: [{name: "admin", id: "admin-id", composite: false, clientRole: false}],
          client: {},
        },
      });
      const result = cleanRealmTemplate(raw, "test");
      const roles = (result.roles as {realm: Array<{name: string}>}).realm;
      const adminRoles = roles.filter((r) => r.name === "admin");
      expect(adminRoles).toHaveLength(1);
    });

    it("strips id from every realm role", () => {
      const raw = makeRawRealm({
        roles: {
          realm: [
            {name: "admin", id: "admin-id"},
            {name: "user", id: "user-id"},
          ],
          client: {},
        },
      });
      const result = cleanRealmTemplate(raw, "test");
      const roles = (result.roles as {realm: Array<Record<string, unknown>>}).realm;
      for (const role of roles) {
        expect(role.id).toBeUndefined();
      }
    });

    it("removes builtin keys from roles.client", () => {
      const raw = makeRawRealm({
        roles: {
          realm: [],
          client: {
            account: [{name: "manage-account"}],
            "realm-management": [{name: "manage-users"}],
            "my-app": [{name: "app-role"}],
          },
        },
      });
      const result = cleanRealmTemplate(raw, "test");
      const clientRoles = (result.roles as {client: Record<string, unknown>}).client;
      expect(clientRoles["account"]).toBeUndefined();
      expect(clientRoles["realm-management"]).toBeUndefined();
      expect(clientRoles["my-app"]).toBeDefined();
    });

    it("initializes realm roles as array when missing from input", () => {
      const raw: Record<string, unknown> = {
        id: "uuid",
        realm: "test",
        roles: {},
      };
      const result = cleanRealmTemplate(raw, "test");
      const roles = (result.roles as {realm: Array<{name: string}>}).realm;
      expect(Array.isArray(roles)).toBe(true);
    });
  });
});
