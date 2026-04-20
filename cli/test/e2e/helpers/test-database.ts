import {GenericContainer, type StartedTestContainer, Wait} from "testcontainers";

export interface TestDatabase {
  container: StartedTestContainer;
  url: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Start an isolated PostgreSQL container for E2E testing.
 * Uses GenericContainer from testcontainers v11 with a health check
 * to ensure PostgreSQL is ready before returning.
 */
export async function startPostgres(imageTag = "16-alpine"): Promise<TestDatabase> {
  const container = await new GenericContainer(`postgres:${imageTag}`)
    .withEnvironment({
      POSTGRES_DB: "postkit_test",
      POSTGRES_USER: "postkit",
      POSTGRES_PASSWORD: "postkit",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .withStartupTimeout(60_000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const url = `postgres://postkit:postkit@${host}:${port}/postkit_test`;

  return {container, url, host, port, database: "postkit_test", user: "postkit", password: "postkit"};
}

/**
 * Stop a PostgreSQL container.
 */
export async function stopPostgres(db: TestDatabase): Promise<void> {
  await db.container.stop();
}

/**
 * Start two PostgreSQL containers for tests that need distinct local/remote DBs.
 * E.g., `deploy` command requires localDbUrl !== remoteUrl.
 */
export async function startPostgresPair(): Promise<{local: TestDatabase; remote: TestDatabase}> {
  const [local, remote] = await Promise.all([startPostgres(), startPostgres()]);
  return {local, remote};
}

/**
 * Stop a pair of PostgreSQL containers.
 */
export async function stopPostgresPair({local, remote}: {local: TestDatabase; remote: TestDatabase}): Promise<void> {
  await Promise.all([stopPostgres(local), stopPostgres(remote)]);
}
