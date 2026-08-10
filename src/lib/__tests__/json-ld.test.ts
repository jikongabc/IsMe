import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/components/seo/JsonLd";

describe("serializeJsonLd", () => {
  it("cannot close the script element from stored content", () => {
    const value = serializeJsonLd({
      name: '</script><script>alert("stored-xss")</script>',
    });

    expect(value).not.toContain("<");
    expect(JSON.parse(value)).toEqual({
      name: '</script><script>alert("stored-xss")</script>',
    });
  });
});
