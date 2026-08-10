import type { CogDocChatResponse, NormalizedChatResult } from "./types";

export function normalizeChatResponse(
  response: CogDocChatResponse,
  demo = false,
): NormalizedChatResult {
  return {
    answer: response.answer,
    sessionId: response.session_id,
    requestId: response.request_id,
    traceId: response.trace_id,
    taskType: response.task_type,
    isValid: response.is_valid,
    citations: (response.citations ?? []).map((c) => ({
      source: c.source ?? "",
      page: c.page ?? c.page_start ?? null,
      chunkId: c.chunk_id ?? "",
    })),
    evidence: (response.evidence ?? []).map((e) => ({
      source: e.source ?? "",
      page: e.page ?? e.page_start ?? null,
      sectionTitle: e.section_title ?? "",
      preview: e.text_preview ?? "",
    })),
    demo,
  };
}

export function buildDemoAnswer(publicModule: string, query: string): NormalizedChatResult {
  return normalizeChatResponse(
    {
      schema_version: "v1",
      request_id: `demo_${crypto.randomUUID()}`,
      trace_id: `demo_trace_${crypto.randomUUID()}`,
      doc_id: "demo",
      session_id: `demo_${publicModule}`,
      task_type: "qa",
      answer:
        `演示模式：尚未配置 COGDOC_API_URL，因此不会调用真实 CogDoc。\n\n` +
        `当前公开模块：\`${publicModule}\`\n` +
        `你的问题：${query}\n\n` +
        `在 .env 中填写 CogDoc 地址与 API Key 后，这里会返回带引用的真实答案。`,
      citations: [
        {
          source: "demo-placeholder.md",
          page: 1,
          chunk_id: "demo-chunk-1",
        },
      ],
      evidence: [
        {
          source: "demo-placeholder.md",
          page: 1,
          section_title: "Demo mode",
          text_preview: "Configure COGDOC_API_URL to enable live retrieval.",
        },
      ],
      critique: "",
      is_valid: true,
    },
    true,
  );
}
