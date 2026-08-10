import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "@/lib/auth/client-ip";

describe("clientIpFromHeaders", () => {
  it("prefers X-Real-IP over X-Forwarded-For", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.9",
      "x-forwarded-for": "1.1.1.1, 203.0.113.9",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("uses the rightmost X-Forwarded-For hop when Real-IP missing", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.1.1.1, 10.0.0.2, 198.51.100.7",
    });
    expect(clientIpFromHeaders(headers)).toBe("198.51.100.7");
  });

  it("ignores spoofed leftmost XFF when Real-IP is set", () => {
    const headers = new Headers({
      "x-real-ip": "198.51.100.7",
      "x-forwarded-for": "8.8.8.8",
    });
    expect(clientIpFromHeaders(headers)).toBe("198.51.100.7");
  });

  it("returns unknown when nothing is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
