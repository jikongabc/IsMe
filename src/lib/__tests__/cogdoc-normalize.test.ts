import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { buildDemoAnswer, normalizeChatResponse } from "@/lib/cogdoc/normalize";
import { encodeSse } from "@/lib/cogdoc/client";

describe("cogdoc normalize", () => {
  it("maps citations and evidence", () => {
    const result = normalizeChatResponse({
      schema_version: "v1",
      request_id: "r1",
      trace_id: "t1",
      doc_id: "kb",
      session_id: "s1",
      task_type: "qa",
      answer: "hello",
      citations: [{ source: "a.pdf", page: 2, chunk_id: "c1" }],
      evidence: [
        {
          source: "a.pdf",
          page_start: 2,
          section_title: "Intro",
          text_preview: "preview",
        },
      ],
      critique: "",
      is_valid: true,
    });

    expect(result.citations[0]).toEqual({
      source: "a.pdf",
      page: 2,
      chunkId: "c1",
    });
    expect(result.evidence[0]).toMatchObject({
      source: "a.pdf",
      page: 2,
      sectionTitle: "Intro",
      preview: "preview",
    });
    expect(result.demo).toBe(false);
  });

  it("builds demo answers without crashing", () => {
    const demo = buildDemoAnswer("about", "who are you?");
    expect(demo.demo).toBe(true);
    expect(demo.answer).toContain("演示模式");
    expect(demo.answer).toContain("`about`");
    expect(demo.answer).not.toContain("portfolio-about");
    expect(demo.sessionId).toBe("demo_about");
    expect(demo.citations.length).toBeGreaterThan(0);
  });

  it("encodes sse frames", () => {
    expect(encodeSse("token", { content: "hi" })).toBe(
      'event: token\ndata: {"content":"hi"}\n\n',
    );
  });
});
