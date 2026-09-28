import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: the Phase 1 "done when" path. Needs a running app (BASE_URL, default
 * http://localhost:3000) and two active test users with passwords:
 *   E2E_EMAIL / E2E_PASSWORD           — Acquisitions or Admin
 *   E2E_MENTION_EMAIL / E2E_PASSWORD   — a teammate to @mention
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
  projects: [{ name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" } }],
});
