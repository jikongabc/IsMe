"use client";

import DOMPurify from "isomorphic-dompurify";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { ContentFormat } from "@/lib/content/format";

const PURIFY = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ["target", "rel"],
};

type Props = {
  content: string;
  format?: ContentFormat | string | null;
  className?: string;
  /** Use when the surrounding page already owns the document's h1. */
  demoteHeadings?: boolean;
};

export function demoteHtmlHeadings(html: string): string {
  return html.replace(/<(\/?)h([1-5])(\b[^>]*)>/gi, (_match, slash, level, rest) =>
    `<${slash}h${Number(level) + 1}${rest}>`,
  );
}

export function RichContent({
  content,
  format = "markdown",
  className,
  demoteHeadings = false,
}: Props) {
  const mode = format === "html" ? "html" : "markdown";
  const raw = content ?? "";

  if (!raw.trim()) return null;

  if (mode === "html") {
    const sanitized = DOMPurify.sanitize(raw, PURIFY);
    const html = demoteHeadings ? demoteHtmlHeadings(sanitized) : sanitized;
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={
          demoteHeadings
            ? {
                h1: ({ node, ...props }) => {
                  void node;
                  return <h2 {...props} />;
                },
                h2: ({ node, ...props }) => {
                  void node;
                  return <h3 {...props} />;
                },
                h3: ({ node, ...props }) => {
                  void node;
                  return <h4 {...props} />;
                },
                h4: ({ node, ...props }) => {
                  void node;
                  return <h5 {...props} />;
                },
                h5: ({ node, ...props }) => {
                  void node;
                  return <h6 {...props} />;
                },
              }
            : undefined
        }
      >
        {raw}
      </ReactMarkdown>
    </div>
  );
}
