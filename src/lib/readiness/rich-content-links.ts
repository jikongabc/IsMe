import DOMPurify from "isomorphic-dompurify";
import { defaultUrlTransform } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const PURIFY_OPTIONS = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ["target", "rel"],
  RETURN_DOM_FRAGMENT: true as const,
};

function anchorHrefsFromHtml(html: string): string[] {
  const fragment = DOMPurify.sanitize(html, PURIFY_OPTIONS);
  return Array.from(fragment.querySelectorAll("a[href]"))
    .map((anchor) => anchor.getAttribute("href")?.trim() ?? "")
    .filter(Boolean);
}

function anchorHrefsFromMarkdown(markdown: string): string[] {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize);
  const tree = processor.runSync(processor.parse(markdown));
  const hrefs: string[] = [];

  visit(tree, "element", (node) => {
    if (node.tagName !== "a") return;
    const href = node.properties?.href;
    if (typeof href !== "string") return;
    const safeHref = defaultUrlTransform(href).trim();
    if (safeHref) hrefs.push(safeHref);
  });

  return hrefs;
}

/**
 * Extract only anchors that RichContent makes clickable for an explicit mode.
 * Unknown or missing formats fail closed instead of guessing or scanning both.
 */
export function extractRichContentHrefs(
  content: string,
  contentFormat: unknown,
): string[] {
  if (typeof content !== "string" || !content.trim()) return [];

  if (contentFormat === "html") {
    return anchorHrefsFromHtml(content);
  }

  if (contentFormat !== "markdown") return [];

  return anchorHrefsFromMarkdown(content);
}
