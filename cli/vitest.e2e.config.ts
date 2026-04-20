import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/e2e/**/*.test.ts"],
    // E2E tests are slow: Docker startup, DB operations, CLI process spawns
    // Keep reasonable — when Docker is running, containers start in ~5s
    testTimeout: 60_000,
    hookTimeout: 45_000,
    // Run sequentially — Docker containers are heavy
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      enabled: false,
    },
  },
});
