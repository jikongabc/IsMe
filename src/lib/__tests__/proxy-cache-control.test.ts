import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

const authMocks = vi.hoisted(() => ({
  isAdminIpAllowedForRequest: vi.fn(),
  verifyAdminSessionToken: vi.fn(),
}));

vi.mock("@/lib/auth/ip-allowlist", () => ({
  isAdminIpAllowedForRequest: authMocks.isAdminIpAllowedForRequest,
}));

vi.mock("@/lib/auth/session-cookie", () => ({
  ADMIN_SESSION_COOKIE: "isme_admin_session",
  verifyAdminSessionToken: authMocks.verifyAdminSessionToken,
}));

function request(pathname: string, headers?: HeadersInit) {
  return new NextRequest(`https://portfolio.example${pathname}`, { headers });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
}

beforeEach(() => {
  authMocks.isAdminIpAllowedForRequest.mockReset();
  authMocks.isAdminIpAllowedForRequest.mockReturnValue(true);
  authMocks.verifyAdminSessionToken.mockReset();
  authMocks.verifyAdminSessionToken.mockResolvedValue(false);
});

describe("Proxy admin rejection cache control", () => {
  it("marks an admin API session rejection private and no-store", async () => {
    const response = await proxy(request("/api/admin/profile"));

    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
  });

  it.each([
    ["admin API", "/api/admin/profile"],
    ["admin page", "/admin/profile"],
  ])("marks an IP-denied %s response private and no-store", async (_label, pathname) => {
    authMocks.isAdminIpAllowedForRequest.mockReturnValue(false);

    const response = await proxy(request(pathname));

    expect(response.status).toBe(403);
    expectPrivateNoStore(response);
  });

  it.each([
    ["public page", "/"],
    ["public API", "/api/health"],
    ["admin login pass-through", "/admin/login"],
  ])("does not add private no-store to %s", async (_label, pathname) => {
    const response = await proxy(request(pathname));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("does not add private no-store to the admin login redirect", async () => {
    const response = await proxy(request("/admin/profile"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://portfolio.example/admin/login?next=%2Fadmin%2Fprofile",
    );
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("does not add private no-store to an authenticated admin API pass-through", async () => {
    authMocks.verifyAdminSessionToken.mockResolvedValue(true);

    const response = await proxy(
      request("/api/admin/profile", { cookie: "isme_admin_session=valid" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBeNull();
  });
});
