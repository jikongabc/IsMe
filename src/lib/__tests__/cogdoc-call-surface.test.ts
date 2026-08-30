import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requestFile = "src/lib/cogdoc/request.ts";
const callers = [
  "src/lib/cogdoc/client.ts",
  "src/lib/cogdoc/admin-client.ts",
  "src/app/api/feedback/route.ts",
];

function source(file: string): string {
  return readFileSync(file, "utf8");
}

describe("CogDoc request call surface", () => {
  it("keeps fetch and bearer assembly exclusively in the server-only helper", () => {
    const helper = source(requestFile);
    expect(helper).toContain('import "server-only"');
    expect(helper.match(/\bfetch\s*\(/g)).toHaveLength(1);
    expect(helper.match(/headers\.set\("Authorization", `Bearer /g)).toHaveLength(1);

    for (const file of callers) {
      expect(source(file), file).not.toMatch(/\bfetch\s*\(/);
      expect(source(file), file).not.toMatch(/Authorization|Bearer /);
    }
  });

  it("routes all fifteen enumerated HTTP operations through cogdocRequest", () => {
    const calls = callers.flatMap((file) =>
      source(file).match(/\bcogdocRequest\s*\(/g) ?? [],
    );
    expect(calls).toHaveLength(15);
  });

  it("keeps the insecure HTTP opt-in outside every request API", () => {
    for (const file of [requestFile, ...callers]) {
      expect(source(file), file).not.toContain("COGDOC_ALLOW_INSECURE_HTTP");
    }

    const envSource = source("src/lib/env.ts");
    expect(envSource).toContain("process.env.COGDOC_ALLOW_INSECURE_HTTP");
    expect(envSource).toContain("allowInsecureHttp: isCogDocInsecureHttpAllowed(");
  });
});
