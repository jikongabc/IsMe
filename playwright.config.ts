import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_E2E_SESSION_SECRET,
  e2eAdminPassword,
} from "./e2e/test-env";

const port = Number(process.env.E2E_PORT || 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const isolatedDatabasePath =
  process.env.ISME_E2E_DATABASE_PATH ||
  path.join(tmpdir(), `isme-playwright-${process.pid}-${randomUUID()}.db`);

export default defineConfig({
  testDir: "e2e",
  // The standalone app intentionally has one writable SQLite database. Serial
  // browser tests avoid making unrelated cases contend for that shared file.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Local machines often already have Chrome; CI installs Playwright's Chromium.
        ...(process.env.CI ? {} : { channel: "chrome" as const }),
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run db:migrate && npm run db:seed && node .next/standalone/server.js`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          PORT: String(port),
          HOSTNAME: "127.0.0.1",
          // Never point E2E at the developer or production database by accident.
          ISME_DATABASE_PATH: isolatedDatabasePath,
          ADMIN_PASSWORD: e2eAdminPassword(),
          SESSION_SECRET: process.env.SESSION_SECRET || DEFAULT_E2E_SESSION_SECRET,
          SITE_URL: baseURL,
          COGDOC_API_URL: "",
          COGDOC_API_KEY: "",
        },
      },
});
