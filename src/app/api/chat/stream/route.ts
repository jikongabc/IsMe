import { tryRecordChatEvent } from "@/lib/analytics/chat-events";
import { resolveChatRequest } from "@/lib/chat/resolve-module";
import { encodeSse, streamChatWithCogDoc } from "@/lib/cogdoc/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const resolved = await resolveChatRequest(request);
  if (resolved.error) return resolved.error;

  const { moduleSlug, cogdocKbId, query, sessionId } = resolved.data;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const push = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSse(event, data)));
      };

      try {
        for await (const event of streamChatWithCogDoc({
          docId: cogdocKbId,
          publicId: moduleSlug,
          query,
          sessionId,
        })) {
          if (event.type === "start") {
            push("start", { traceId: event.traceId, moduleSlug });
          } else if (event.type === "node") {
            push("node", { stage: event.stage, detail: event.detail });
          } else if (event.type === "token") {
            push("token", { content: event.content });
          } else if (event.type === "final") {
            tryRecordChatEvent({
              moduleSlug,
              query,
              sessionId: event.result.sessionId ?? sessionId,
              traceId: event.result.traceId,
              demo: event.result.demo,
            });
            push("final", {
              ...event.result,
              moduleSlug,
            });
          } else if (event.type === "error") {
            push("error", { code: event.code, error: event.message });
          }
        }
      } catch {
        push("error", {
          code: "INTERNAL_ERROR",
          error: "Unexpected stream error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
