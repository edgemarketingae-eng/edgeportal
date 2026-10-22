import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./config";

/**
 * Runs against the isolated stack in stack.ts (all integrations mocked: OTP 000000, mock gateway,
 * mock Meet/Drive). To iterate faster, start it once with `pnpm --filter @edge/e2e stack` and run the
 * tests with E2E_REUSE_STACK=1.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "./node_modules/.bin/tsx stack.ts",
    url: `http://127.0.0.1:${E2E.consolePort}/login`,
    reuseExistingServer: !!process.env.E2E_REUSE_STACK,
    timeout: 600_000,
    stdout: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
  },
});
