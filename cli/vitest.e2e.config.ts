import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/e2e/**/*.test.ts"],
    // E2E tests are slow: Docker startup, DB operations, CLI process spawns
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Run sequentially — Docker containers are heavy
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      enabled: false,
    },
  },
});
