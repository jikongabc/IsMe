import { initializeDatabase } from "@/lib/db";
import { getEnv } from "@/lib/env";

export function prepareNodeServer(): void {
  try {
    // Fail when required secrets are absent or still equal the documented
    // production placeholders, before any database or request work begins.
    getEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid server environment";
    console.error(`IsMe startup validation failed: ${message}`);
    // A rejected instrumentation hook leaves standalone alive but returning
    // 500. Exit so container supervisors fail closed and can surface the error.
    process.exit(1);
  }

  initializeDatabase();
}
