import { describe, expect, it, vi } from "vitest";
import {
  auditReadinessLinks,
  buildPinnedRequestOptions,
  isPublicIpAddress,
  MAX_LINK_AUDIT_TARGETS,
  sanitizeAuditedUrl,
  type LinkAuditOptions,
  type LinkAuditTransportRequest,
  type ReadinessLinkTarget,
} from "@/lib/readiness/link-audit";

const publicLookup: NonNullable<LinkAuditOptions["lookup"]> = async () => [
  { address: "93.184.216.34", family: 4 },
];

function target(url: string, label = "Project demo"): ReadinessLinkTarget {
  return { url, label, source: "project:demo" };
}

describe("isPublicIpAddress", () => {
  it.each([
    "0.0.0.0",
    "10.2.3.4",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.10",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.2",
    "203.0.113.8",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:192.168.1.1",
    "not-an-ip",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("accepts public unicast address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });
});

describe("sanitizeAuditedUrl", () => {
  it("removes credentials, query strings and fragments", () => {
    expect(
      sanitizeAuditedUrl(
        "https://user:secret@example.com/private/path?token=do-not-return#fragment",
      ),
    ).toBe("https://example.com/private/path");
  });

  it("does not echo malformed input", () => {
    expect(sanitizeAuditedUrl("not a URL?token=do-not-return")).toBe("(invalid URL)");
  });
});

describe("buildPinnedRequestOptions", () => {
  it("connects to the validated IP while preserving Host, SNI, and abort signal", () => {
    const controller = new AbortController();
    const options = buildPinnedRequestOptions({
      url: new URL("https://portfolio.dev/case?preview=1"),
      address: "93.184.216.34",
      family: 4,
      method: "HEAD",
      timeoutMs: 5_000,
      signal: controller.signal,
    });

    expect(options).toMatchObject({
      protocol: "https:",
      hostname: "93.184.216.34",
      family: 4,
      port: 443,
      method: "HEAD",
      path: "/case?preview=1",
      agent: false,
      servername: "portfolio.dev",
    });
    expect(options.signal).toBe(controller.signal);
    expect(options.headers).toMatchObject({
      Host: "portfolio.dev",
      Connection: "close",
    });
    expect(options).toHaveProperty("checkServerIdentity", expect.any(Function));
  });
});

describe("auditReadinessLinks", () => {
  it("pins the request to the validated DNS address and keeps queries out of results", async () => {
    const lookup = vi.fn(publicLookup);
    const transport = vi.fn(async (request: LinkAuditTransportRequest) => {
      void request;
      return { statusCode: 204 };
    });

    const [result] = await auditReadinessLinks(
      [target("https://example.com/demo?preview_token=do-not-return#section")],
      { lookup, transport },
    );

    expect(result).toMatchObject({
      url: "https://example.com/demo",
      status: "ok",
      httpStatus: 204,
    });
    expect(JSON.stringify(result)).not.toContain("do-not-return");
    expect(lookup).toHaveBeenCalledWith("example.com");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toMatchObject({
      address: "93.184.216.34",
      family: 4,
      method: "HEAD",
    });
    expect(transport.mock.calls[0]![0].url.search).toBe(
      "?preview_token=do-not-return",
    );
  });

  it.each([301, 304, 400, 401, 403, 404, 410, 429, 451, 500, 503])(
    "treats an unusable HTTP %s destination as failed",
    async (statusCode) => {
      const [result] = await auditReadinessLinks([target("https://example.com/missing")], {
        lookup: publicLookup,
        transport: async () => ({ statusCode }),
      });

      expect(result).toMatchObject({ status: "failed", httpStatus: statusCode });
    },
  );
  it.each([200, 204, 206])(
    "accepts HTTP %s as evidence that the destination is reachable",
    async (statusCode) => {
      const [result] = await auditReadinessLinks([target("https://example.com/reachable")], {
        lookup: publicLookup,
        transport: async () => ({ statusCode }),
      });

      expect(result).toMatchObject({ status: "ok", httpStatus: statusCode });
    },
  );

  it("blocks plaintext links and HTTPS downgrade redirects", async () => {
    const transport = vi.fn(async () => ({
      statusCode: 302,
      location: "http://public.example/final",
    }));

    const [plain, downgrade] = await Promise.all([
      auditReadinessLinks([target("http://example.com/public")], {
        lookup: publicLookup,
        transport,
      }),
      auditReadinessLinks([target("https://example.com/public")], {
        lookup: publicLookup,
        transport,
      }),
    ]);

    expect(plain[0]).toMatchObject({ status: "blocked" });
    expect(downgrade[0]).toMatchObject({ status: "blocked" });
    expect(plain[0]?.detail).toContain("HTTPS");
    expect(downgrade[0]?.detail).toContain("HTTPS");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("blocks private and mixed DNS answers before opening a connection", async () => {
    const transport = vi.fn(async () => ({ statusCode: 200 }));
    const privateResult = await auditReadinessLinks([target("https://private.test")], {
      lookup: async () => [{ address: "10.0.0.2", family: 4 }],
      transport,
    });
    const mixedResult = await auditReadinessLinks([target("https://mixed.test")], {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "::ffff:127.0.0.1", family: 6 },
      ],
      transport,
    });

    expect(privateResult[0]?.status).toBe("blocked");
    expect(mixedResult[0]?.status).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
  ])("blocks normalized private IP literal %s", async (url) => {
    const transport = vi.fn(async () => ({ statusCode: 200 }));
    const [result] = await auditReadinessLinks([target(url)], {
      lookup: publicLookup,
      transport,
    });

    expect(result?.status).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
  });

  it("blocks URL credentials and non-default ports without echoing secrets", async () => {
    const transport = vi.fn(async () => ({ statusCode: 200 }));
    const results = await auditReadinessLinks(
      [
        target("https://admin:secret@example.com/path?token=hidden"),
        target("https://example.com:8443/path"),
      ],
      { lookup: publicLookup, transport },
    );

    expect(results.map((result) => result.status)).toEqual(["blocked", "blocked"]);
    expect(JSON.stringify(results)).not.toContain("secret");
    expect(JSON.stringify(results)).not.toContain("hidden");
    expect(transport).not.toHaveBeenCalled();
  });

  it("falls back to GET for a terminal HEAD failure and resolves DNS again", async () => {
    const lookup = vi.fn(publicLookup);
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ statusCode: 405 })
      .mockResolvedValueOnce({ statusCode: 204 });

    const [result] = await auditReadinessLinks([target("https://example.com/demo")], {
      lookup,
      transport,
    });

    expect(result).toMatchObject({ status: "ok", httpStatus: 204 });
    expect(transport.mock.calls.map(([request]) => request.method)).toEqual([
      "HEAD",
      "GET",
    ]);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("accepts a public GET when a WAF rejects HEAD", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ statusCode: 403 })
      .mockResolvedValueOnce({ statusCode: 200 });

    const [result] = await auditReadinessLinks([target("https://example.com/demo")], {
      lookup: publicLookup,
      transport,
    });

    expect(result).toMatchObject({ status: "ok", httpStatus: 200 });
    expect(transport.mock.calls.map(([request]) => request.method)).toEqual(["HEAD", "GET"]);
  });

  it.each([
    "http://2130706433/admin",
    "http://0x7f000001/admin",
    "http://[::1]/admin",
    "http://[::ffff:127.0.0.1]/admin",
  ])("revalidates and blocks redirect target %s", async (location) => {
    const transport = vi.fn(async () => ({ statusCode: 302, location }));

    const [result] = await auditReadinessLinks([target("https://example.com")], {
      lookup: publicLookup,
      transport,
    });

    expect(result?.status).toBe("blocked");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("re-resolves each safe redirect and connects only to the new validated IP", async () => {
    const lookup = vi.fn(async (hostname: string) =>
      hostname === "example.com"
        ? [{ address: "93.184.216.34", family: 4 as const }]
        : [{ address: "1.1.1.1", family: 4 as const }],
    );
    const transport = vi
      .fn()
      .mockResolvedValueOnce({
        statusCode: 302,
        location: "https://redirect.example/final",
      })
      .mockResolvedValueOnce({ statusCode: 200 });

    const [result] = await auditReadinessLinks([target("https://example.com")], {
      lookup,
      transport,
    });

    expect(result).toMatchObject({ status: "ok", httpStatus: 200 });
    expect(lookup.mock.calls.map(([hostname]) => hostname)).toEqual([
      "example.com",
      "redirect.example",
    ]);
    expect(transport.mock.calls.map(([request]) => request.address)).toEqual([
      "93.184.216.34",
      "1.1.1.1",
    ]);
  });

  it("fails closed after three redirects", async () => {
    let requestCount = 0;
    const transport = vi.fn(async () => {
      requestCount += 1;
      return { statusCode: 302, location: `/redirect-${requestCount}` };
    });

    const [result] = await auditReadinessLinks([target("https://example.com")], {
      lookup: publicLookup,
      transport,
      maxRedirects: 99,
    });

    expect(result?.status).toBe("failed");
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it("uses one five-second-style deadline across the whole redirect chain", async () => {
    let redirectIndex = 0;
    const transport = vi.fn(
      async ({ signal }: LinkAuditTransportRequest) =>
        new Promise<{ statusCode: number; location: string }>((resolve, reject) => {
          const timer = setTimeout(() => {
            redirectIndex += 1;
            resolve({ statusCode: 302, location: `/slow-${redirectIndex}` });
          }, 60);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            },
            { once: true },
          );
        }),
    );

    const [result] = await auditReadinessLinks([target("https://example.com")], {
      lookup: publicLookup,
      transport,
      timeoutMs: 100,
    });

    expect(result?.status).toBe("failed");
    expect(result?.detail).toContain("five seconds");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("treats 5xx as failed without leaking raw DNS errors", async () => {
    const [serverError] = await auditReadinessLinks(
      [target("https://example.com/path?secret=hidden")],
      {
        lookup: publicLookup,
        transport: async () => ({ statusCode: 503 }),
      },
    );
    const [dnsError] = await auditReadinessLinks(
      [target("https://unresolved.test/path?secret=hidden")],
      {
        lookup: async () => {
          throw new Error("lookup failed for unresolved.test?secret=hidden");
        },
        transport: async () => ({ statusCode: 200 }),
      },
    );

    expect(serverError).toMatchObject({ status: "failed", httpStatus: 503 });
    expect(dnsError?.status).toBe("failed");
    expect(JSON.stringify([serverError, dnsError])).not.toContain("hidden");
  });

  it("skips malformed URLs and blocks unsupported protocols", async () => {
    const results = await auditReadinessLinks(
      [target("not a URL?secret=hidden"), target("file:///etc/passwd")],
      { lookup: publicLookup, transport: async () => ({ statusCode: 200 }) },
    );

    expect(results.map((result) => result.status)).toEqual(["skipped", "blocked"]);
    expect(JSON.stringify(results)).not.toContain("hidden");
  });

  it("caps the workload and never runs more than four requests concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const transport = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { statusCode: 200 };
    });
    const targets = Array.from({ length: MAX_LINK_AUDIT_TARGETS + 5 }, (_, index) =>
      target(`https://example.com/${index}`),
    );

    const results = await auditReadinessLinks(targets, {
      lookup: publicLookup,
      transport,
      concurrency: 99,
    });

    expect(results).toHaveLength(MAX_LINK_AUDIT_TARGETS);
    expect(transport).toHaveBeenCalledTimes(MAX_LINK_AUDIT_TARGETS);
    expect(maxActive).toBeLessThanOrEqual(4);
  });
});
