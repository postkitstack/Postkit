import {vi} from "vitest";

export interface MockPgClient {
  connect: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock pg.Client with configurable behavior.
 */
export function createMockPgClient(): MockPgClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({rows: [], rowCount: 0}),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Sets up the pg module mock to return the given client.
 */
export function setupPgMock(client: MockPgClient) {
  return {
    Client: vi.fn(() => client),
  };
}
