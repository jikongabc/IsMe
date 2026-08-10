import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  outputFileTracingIncludes: {
    "/**": ["./node_modules/better-sqlite3/**/*"],
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
