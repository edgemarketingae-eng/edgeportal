import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", globalSetup: ["@edge/db/testing/global-setup"], testTimeout: 30_000, hookTimeout: 120_000 },
});
