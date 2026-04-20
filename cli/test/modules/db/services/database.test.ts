import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("pg", () => {
  const connect = vi.fn();
  const query = vi.fn();
  const end = vi.fn();
  class MockPgClient {
    connect = connect;
    query = query;
    end = end;
  }
  return {
    default: {Client: MockPgClient},
    Client: MockPgClient,
  };
});

vi.mock("../../../../src/common/shell", () => ({
  runPipedCommands: vi.fn(),
}));

// Get references to the mocked functions via pg import
import pg from "pg";
import {runPipedCommands} from "../../../../src/common/shell";
import {parseConnectionUrl, testConnection, createDatabase, dropDatabase, cloneDatabase} from "../../../../src/modules/db/services/database";

// Access mock methods from the Client prototype
const getMockClient = () => {
  const instance = new (pg.Client as any)();
  return instance as {connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>};
};

describe("database", () => {
  let mockClient: ReturnType<typeof getMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = getMockClient();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.query.mockResolvedValue({rows: [], rowCount: 0});
    mockClient.end.mockResolvedValue(undefined);
  });

  describe("parseConnectionUrl()", () => {
    it("parses standard postgres URL", () => {
      const info = parseConnectionUrl("postgres://user:pass@host:5433/mydb");
      expect(info.host).toBe("host");
      expect(info.port).toBe(5433);
      expect(info.database).toBe("mydb");
      expect(info.user).toBe("user");
      expect(info.password).toBe("pass");
    });

    it("uses default port 5432 when not specified", () => {
      expect(parseConnectionUrl("postgres://user:pass@host/mydb").port).toBe(5432);
    });

    it("decodes URL-encoded password", () => {
      expect(parseConnectionUrl("postgres://user:p%40ss@host/db").password).toBe("p@ss");
    });
  });

  describe("testConnection()", () => {
    it("returns true on successful connection", async () => {
      const result = await testConnection("postgres://user:pass@host/db");
      expect(result).toBe(true);
      expect(mockClient.end).toHaveBeenCalled();
    });

    it("returns false on connection failure", async () => {
      mockClient.connect.mockRejectedValue(new Error("refused"));
      const result = await testConnection("postgres://user:pass@host/db");
      expect(result).toBe(false);
      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe("createDatabase()", () => {
    it("creates DB if it does not exist", async () => {
      mockClient.query.mockResolvedValue({rows: []});
      await createDatabase("postgres://user:pass@host/newdb");
      const queries = mockClient.query.mock.calls.map((c: any) => c[0]);
      expect(queries.some((q: string) => q.includes("CREATE DATABASE"))).toBe(true);
    });

    it("skips creation if DB already exists", async () => {
      mockClient.query.mockResolvedValue({rows: [{exists: 1}]});
      await createDatabase("postgres://user:pass@host/existing");
      const queries = mockClient.query.mock.calls.map((c: any) => c[0]);
      expect(queries.some((q: string) => q.includes("CREATE DATABASE"))).toBe(false);
    });
  });

  describe("dropDatabase()", () => {
    it("terminates connections then drops database", async () => {
      await dropDatabase("postgres://user:pass@host/target");
      const queries = mockClient.query.mock.calls.map((c: any) => c[0]);
      expect(queries.some((q: string) => q.includes("pg_terminate_backend"))).toBe(true);
      expect(queries.some((q: string) => q.includes("DROP DATABASE"))).toBe(true);
    });
  });

  describe("cloneDatabase()", () => {
    it("calls runPipedCommands with pg_dump and psql", async () => {
      vi.mocked(runPipedCommands).mockResolvedValue({stdout: "", stderr: "", exitCode: 0});
      await cloneDatabase("postgres://src:pass@src-host:5432/srcdb", "postgres://dst:pass@dst-host:5432/dstdb");
      expect(runPipedCommands).toHaveBeenCalledTimes(1);
      const [producer, consumer] = vi.mocked(runPipedCommands).mock.calls[0]!;
      expect(producer.args[0]).toBe("pg_dump");
      expect(producer.env.PGPASSWORD).toBe("pass");
      expect(consumer.args[0]).toBe("psql");
    });

    it("throws on failure", async () => {
      vi.mocked(runPipedCommands).mockResolvedValue({stdout: "", stderr: "error", exitCode: 1});
      await expect(
        cloneDatabase("postgres://src:pass@host:5432/src", "postgres://dst:pass@host:5432/dst"),
      ).rejects.toThrow("Failed to clone");
    });
  });
});
