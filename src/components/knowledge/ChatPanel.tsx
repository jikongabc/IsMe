"use client";

import { useMemo, useState } from "react";
import { RichContent } from "@/components/content/RichContent";

export type PublicKb = {
  id: string;
  name: string;
  slug: string;
  description: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
};

type Citation = { source: string; page: number | null; chunkId: string };
type Evidence = { source: string; page: number | null; sectionTitle: string; preview: string };

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  evidence?: Evidence[];
  demo?: boolean;
  streaming?: boolean;
  traceId?: string;
  query?: string;
  feedback?: "thumbs_up" | "thumbs_down" | null;
};

export type ChatLabels = {
  empty: string;
  select: string;
  suggested: string;
  send: string;
  /** Use `{slug}` placeholder, e.g. `ask {slug}…` */
  askPlaceholder: string;
  you: string;
  demo: string;
  cite: string;
  evidence: string;
  feedbackUp: string;
  feedbackDown: string;
  feedbackRecorded: string;
  assistant: string;
  working: string;
  failure: string;
  conversation: string;
  questionLabel: string;
  modulesLabel: string;
};

type Props = {
  modules: PublicKb[];
  labels?: Partial<ChatLabels>;
};

const defaultLabels: ChatLabels = {
  empty: "No knowledge topics are available yet.",
  select: "Choose a topic",
  suggested: "Suggested questions",
  send: "Send",
  askPlaceholder: "Ask about {slug}…",
  you: "You",
  demo: "(demo)",
  cite: "Source:",
  evidence: "View evidence",
  feedbackUp: "Helpful",
  feedbackDown: "Needs work",
  feedbackRecorded: "Feedback recorded",
  assistant: "Portfolio assistant",
  working: "Reviewing sources and drafting an answer…",
  failure: "The answer could not be completed: ",
  conversation: "Conversation",
  questionLabel: "Enter your question",
  modulesLabel: "Knowledge topics",
};

function formatAskPlaceholder(template: string, slug: string): string {
  return template.replaceAll("{slug}", slug);
}

function parseSse(buffer: string): {
  frames: Array<{ event: string; data: string }>;
  rest: string;
} {
  const frames: Array<{ event: string; data: string }> = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) frames.push({ event, data: dataLines.join("\n") });
  }
  return { frames, rest };
}

export function ChatPanel({ modules, labels: labelsProp }: Props) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [activeSlug, setActiveSlug] = useState(modules[0]?.slug ?? "");
  const [sessions, setSessions] = useState<Record<string, string | null>>({});
  const [messagesByModule, setMessagesByModule] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  const active = useMemo(
    () => modules.find((m) => m.slug === activeSlug) ?? modules[0],
    [modules, activeSlug],
  );

  const messages = active ? (messagesByModule[active.slug] ?? []) : [];

  function switchModule(slug: string) {
    if (pending) return;
    setActiveSlug(slug);
    setError(null);
    setInput("");
    setStage(null);
  }

  function patchAssistant(moduleSlug: string, updater: (message: Message) => Message) {
    setMessagesByModule((prev) => {
      const list = [...(prev[moduleSlug] ?? [])];
      const last = list[list.length - 1];
      if (!last || last.role !== "assistant") return prev;
      list[list.length - 1] = updater(last);
      return { ...prev, [moduleSlug]: list };
    });
  }

  async function sendFeedback(
    moduleSlug: string,
    index: number,
    feedback: "thumbs_up" | "thumbs_down",
  ) {
    const list = messagesByModule[moduleSlug] ?? [];
    const message = list[index];
    if (!message || message.role !== "assistant" || !message.traceId || message.feedback) {
      return;
    }

    setMessagesByModule((prev) => {
      const next = [...(prev[moduleSlug] ?? [])];
      next[index] = { ...next[index], feedback };
      return { ...prev, [moduleSlug]: next };
    });

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleSlug,
          traceId: message.traceId,
          feedback,
          sessionId: sessions[moduleSlug] ?? null,
          query: message.query,
          answer: message.content,
          feedbackType: feedback === "thumbs_down" ? "wrong_answer" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "feedback failed");
    } catch (err) {
      setMessagesByModule((prev) => {
        const next = [...(prev[moduleSlug] ?? [])];
        next[index] = { ...next[index], feedback: null };
        return { ...prev, [moduleSlug]: next };
      });
      setError(err instanceof Error ? err.message : "feedback failed");
    }
  }

  async function ask(question: string) {
    if (!active || !question.trim() || pending) return;
    const moduleSlug = active.slug;
    const trimmed = question.trim();

    setMessagesByModule((prev) => ({
      ...prev,
      [moduleSlug]: [
        ...(prev[moduleSlug] ?? []),
        { role: "user", content: trimmed },
        { role: "assistant", content: "", streaming: true, query: trimmed },
      ],
    }));
    setInput("");
    setError(null);
    setPending(true);
    setStage("connecting");

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleSlug,
          query: trimmed,
          sessionId: sessions[moduleSlug] ?? null,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Stream request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotFinal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSse(buffer);
        buffer = parsed.rest;

        for (const frame of parsed.frames) {
          const payload = JSON.parse(frame.data) as Record<string, unknown>;

          if (frame.event === "start") {
            setStage("started");
          } else if (frame.event === "node") {
            setStage(String(payload.stage ?? "working"));
          } else if (frame.event === "token") {
            const content = String(payload.content ?? "");
            patchAssistant(moduleSlug, (message) => ({
              ...message,
              content: message.content + content,
              streaming: true,
            }));
          } else if (frame.event === "final") {
            gotFinal = true;
            setSessions((prev) => ({
              ...prev,
              [moduleSlug]: (payload.sessionId as string | null) ?? prev[moduleSlug],
            }));
            patchAssistant(moduleSlug, () => ({
              role: "assistant",
              content: String(payload.answer ?? ""),
              citations: payload.citations as Citation[] | undefined,
              evidence: payload.evidence as Evidence[] | undefined,
              demo: Boolean(payload.demo),
              streaming: false,
              traceId: String(payload.traceId ?? ""),
              query: trimmed,
              feedback: null,
            }));
            setStage(null);
          } else if (frame.event === "error") {
            throw new Error(String(payload.error ?? "Stream error"));
          }
        }
      }

      if (!gotFinal) {
        patchAssistant(moduleSlug, (message) => ({ ...message, streaming: false }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setMessagesByModule((prev) => {
        const list = [...(prev[moduleSlug] ?? [])];
        const last = list[list.length - 1];
        if (last?.role === "assistant" && last.streaming && !last.content) {
          list.pop();
        } else if (last?.role === "assistant") {
          list[list.length - 1] = { ...last, streaming: false };
        }
        return { ...prev, [moduleSlug]: list };
      });
      setStage(null);
    } finally {
      setPending(false);
    }
  }

  if (!active) {
    return <p className="text-ink-muted">{labels.empty}</p>;
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="portfolio-card space-y-2 !p-3" aria-label={labels.modulesLabel}>
        <h2 className="px-2 pb-1 font-display text-lg text-ink">{labels.select}</h2>
        {modules.map((module) => {
          const selected = module.slug === active.slug;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => switchModule(module.slug)}
              aria-pressed={selected}
              className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-transparent text-ink-muted hover:border-line hover:bg-bg-soft hover:text-ink"
              }`}
            >
              <div className="font-semibold">{module.name}</div>
              <div className="mt-0.5 font-mono text-[0.68rem] text-ink-faint">{module.slug}</div>
              <div className="mt-1 text-xs text-ink-faint">{module.description}</div>
            </button>
          );
        })}
      </aside>

      <section
        className="portfolio-card flex min-h-[34rem] min-w-0 flex-col !p-0"
        aria-labelledby="knowledge-conversation-title"
        aria-busy={pending}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 md:px-5">
          <div>
            <p className="section-kicker">{labels.conversation}</p>
            <h2 id="knowledge-conversation-title" className="mt-1 font-display text-xl text-ink">
              {active.name}
            </h2>
          </div>
          <span className="tag-chip">{active.slug}</span>
        </header>

        <div className="border-b border-line bg-bg-soft px-4 py-3 text-sm leading-relaxed text-ink-muted md:px-5">
          {active.welcomeMessage}
        </div>

        <div
          className="flex-1 space-y-4 overflow-y-auto px-4 py-5 text-sm md:px-5"
          role="log"
          aria-live={pending ? "off" : "polite"}
          aria-relevant="additions text"
        >
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="font-medium text-ink">{labels.suggested}</p>
              <div className="flex flex-wrap gap-2">
                {active.suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void ask(q)}
                    disabled={pending}
                    className="rounded-lg border border-line bg-bg-soft px-3 py-2 text-left text-xs leading-relaxed text-ink-muted transition hover:border-accent hover:text-accent"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`rounded-xl border p-4 ${
                message.role === "user"
                  ? "ml-auto max-w-[90%] border-accent/25 bg-accent-soft"
                  : "border-line bg-bg-soft"
              }`}
              aria-label={message.role === "user" ? labels.you : labels.assistant}
            >
              <div className="mb-2 text-xs font-semibold text-ink-faint">
                {message.role === "user" ? (
                  <span className="text-accent-2">{labels.you}</span>
                ) : (
                  <>
                    <span className="text-accent">{labels.assistant}</span>
                    {message.demo ? <span> {labels.demo}</span> : null}
                    {message.streaming ? <span> …</span> : null}
                  </>
                )}
              </div>
              {message.role === "assistant" ? (
                <div
                  className={`leading-relaxed text-ink-muted ${
                    message.streaming ? "caret-blink" : ""
                  }`}
                >
                  {message.content ? (
                    <RichContent
                      content={message.content}
                      format="markdown"
                      className="prose-isme text-sm"
                      demoteHeadings
                    />
                  ) : message.streaming ? (
                    " "
                  ) : null}
                </div>
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed text-ink-muted">
                  {message.content}
                </div>
              )}
              {message.citations && message.citations.length > 0 ? (
                <div className="mt-2 space-y-1 border-l border-accent/40 pl-3 text-xs text-ink-faint">
                  {message.citations.map((c, i) => (
                    <div key={`${c.chunkId}-${i}`}>
                      {labels.cite} {c.source || "source"}
                      {c.page != null ? ` :p${c.page}` : ""}
                    </div>
                  ))}
                </div>
              ) : null}
              {message.evidence && message.evidence.length > 0 ? (
                <details className="mt-3 text-xs text-ink-faint">
                  <summary className="cursor-pointer font-medium text-accent-2">
                    {labels.evidence}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {message.evidence.map((e, i) => (
                      <div key={`${e.source}-${i}`} className="rounded-lg border border-line bg-bg-elevated p-3">
                        <div>
                          {e.sectionTitle || e.source}
                          {e.page != null ? ` :p${e.page}` : ""}
                        </div>
                        <p className="mt-1 text-ink-muted">{e.preview}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {message.role === "assistant" && message.traceId && !message.streaming ? (
                <div className="mt-2 flex gap-2 text-xs">
                  <button
                    type="button"
                    disabled={Boolean(message.feedback)}
                    aria-pressed={message.feedback === "thumbs_up"}
                    onClick={() => void sendFeedback(active.slug, index, "thumbs_up")}
                    className={`border px-2 py-1 transition ${
                      message.feedback === "thumbs_up"
                        ? "border-accent text-accent"
                        : "border-line text-ink-faint hover:border-accent hover:text-accent"
                    }`}
                  >
                    {labels.feedbackUp}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(message.feedback)}
                    aria-pressed={message.feedback === "thumbs_down"}
                    onClick={() => void sendFeedback(active.slug, index, "thumbs_down")}
                    className={`border px-2 py-1 transition ${
                      message.feedback === "thumbs_down"
                        ? "border-danger text-danger"
                        : "border-line text-ink-faint hover:border-danger hover:text-danger"
                    }`}
                  >
                    {labels.feedbackDown}
                  </button>
                  {message.feedback ? (
                    <span className="self-center text-ink-faint">{labels.feedbackRecorded}</span>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}

          {pending && stage ? (
            <p className="animate-fade text-xs text-ink-faint" role="status" aria-live="polite">
              {labels.working}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger" role="alert">
              {labels.failure}{error}
            </p>
          ) : null}
        </div>

        <form
          className="flex flex-wrap gap-2 border-t border-line p-3 md:flex-nowrap"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(input);
          }}
        >
          <label htmlFor="knowledge-question" className="sr-only">
            {labels.questionLabel}
          </label>
          <input
            id="knowledge-question"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={formatAskPlaceholder(labels.askPlaceholder, active.slug)}
            className="min-w-0 flex-[1_1_14rem] rounded-lg border border-line bg-bg-soft px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
            disabled={pending}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="btn-primary !py-2 disabled:opacity-50"
          >
            {labels.send}
          </button>
        </form>
      </section>
    </div>
  );
}
