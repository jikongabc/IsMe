import { afterEach, describe, expect, it } from "vitest";
import {
  isAdminIpAllowedForRequest,
  isIpAllowed,
  parseIpAllowlist,
} from "@/lib/auth/ip-allowlist";

describe("ip allowlist", () => {
  const prev = process.env.ADMIN_IP_ALLOWLIST;

  afterEach(() => {
    if (prev === undefined) delete process.env.ADMIN_IP_ALLOWLIST;
    else process.env.ADMIN_IP_ALLOWLIST = prev;
  });

  it("treats empty config as allow-all", () => {
    expect(parseIpAllowlist("")).toBeNull();
    expect(parseIpAllowlist("  ")).toBeNull();
    expect(isIpAllowed("1.2.3.4", null)).toBe(true);
  });

  it("parses comma-separated IPs", () => {
    expect(parseIpAllowlist("1.1.1.1, 8.8.8.8")).toEqual(["1.1.1.1", "8.8.8.8"]);
  });

  it("enforces membership and wildcard", () => {
    const list = ["10.0.0.1", "10.0.0.2"];
    expect(isIpAllowed("10.0.0.1", list)).toBe(true);
    expect(isIpAllowed("10.0.0.9", list)).toBe(false);
    expect(isIpAllowed("anything", ["*"])).toBe(true);
  });

  it("uses trusted Real-IP for allowlist checks", () => {
    process.env.ADMIN_IP_ALLOWLIST = "198.51.100.7";
    const headers = new Headers({
      "x-real-ip": "198.51.100.7",
      "x-forwarded-for": "8.8.8.8",
    });
    expect(isAdminIpAllowedForRequest(headers)).toBe(true);

    const blocked = new Headers({
      "x-real-ip": "203.0.113.1",
      "x-forwarded-for": "198.51.100.7",
    });
    expect(isAdminIpAllowedForRequest(blocked)).toBe(false);
  });
});
