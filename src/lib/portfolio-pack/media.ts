import { PORTFOLIO_PACK_MAX_MEDIA_REFERENCES } from "./schema";
import type {
  PortfolioPackMediaReference,
  PortfolioPackMediaScan,
  PortfolioPackV1,
} from "./types";

export const PORTFOLIO_PACK_MAX_MEDIA_SCAN_CHARACTERS = 1_000_000;

type MediaScanLimits = {
  maxReferences?: number;
  maxCharacters?: number;
};

type ReferenceContext = Omit<PortfolioPackMediaReference, "kind" | "url">;

const MARKDOWN_IMAGE_RE = /!\[[^\]]{0,500}\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/gi;
const HTML_IMAGE_RE = /<img\b[^>]{0,2000}\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;

function classifyMediaUrl(raw: string): Pick<PortfolioPackMediaReference, "kind" | "url"> | null {
  const candidate = raw.trim().replace(/^<|>$/g, "");
  if (candidate.startsWith("/uploads/")) {
    return { kind: "local-upload", url: candidate.split(/[?#]/, 1)[0] ?? candidate };
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // A preview result is client-visible. Query strings, fragments, and URL
    // credentials can contain bearer material, so only return the public path.
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return { kind: "external", url: url.toString() };
  } catch {
    return null;
  }
}

function subject(primary: string, secondary: string, fallback: string): string {
  return primary.trim() || secondary.trim() || fallback;
}

/**
 * Collects references only. It never reads local files, parses a DOM, or makes
 * a network request. Text scanning is bounded by both characters and results.
 */
export function collectPortfolioPackMediaReferences(
  pack: PortfolioPackV1,
  limits: MediaScanLimits = {},
): PortfolioPackMediaScan {
  const maxReferences = Math.max(
    0,
    Math.min(limits.maxReferences ?? PORTFOLIO_PACK_MAX_MEDIA_REFERENCES, PORTFOLIO_PACK_MAX_MEDIA_REFERENCES),
  );
  const maxCharacters = Math.max(
    0,
    Math.min(
      limits.maxCharacters ?? PORTFOLIO_PACK_MAX_MEDIA_SCAN_CHARACTERS,
      PORTFOLIO_PACK_MAX_MEDIA_SCAN_CHARACTERS,
    ),
  );
  const references: PortfolioPackMediaReference[] = [];
  const seen = new Set<string>();
  let scannedCharacters = 0;
  let truncated = false;

  function add(rawUrl: string, context: ReferenceContext): void {
    if (!rawUrl.trim()) return;
    const classified = classifyMediaUrl(rawUrl);
    if (!classified) return;
    const reference = { ...classified, ...context };
    const key = [reference.kind, reference.url, reference.section, reference.subject, reference.field].join("\u0000");
    if (seen.has(key)) return;
    seen.add(key);
    if (references.length >= maxReferences) {
      truncated = true;
      return;
    }
    references.push(reference);
  }

  function scanText(value: string, context: ReferenceContext): void {
    if (!value || maxCharacters === 0) {
      if (value) truncated = true;
      return;
    }
    const remaining = maxCharacters - scannedCharacters;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    const text = value.length > remaining ? value.slice(0, remaining) : value;
    scannedCharacters += text.length;
    if (text.length < value.length) truncated = true;

    for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
      add(match[1] ?? "", context);
    }
    for (const match of text.matchAll(HTML_IMAGE_RE)) {
      add(match[1] ?? match[2] ?? match[3] ?? "", context);
    }
  }

  add(pack.sections.profile.avatarUrl, {
    section: "profile",
    subject: pack.sections.profile.displayName.trim() || pack.sections.profile.siteName,
    field: "avatarUrl",
  });

  pack.sections.projects.forEach((project) => {
    const projectSubject = subject(project.name, project.nameEn, project.slug);
    add(project.coverUrl, {
      section: "projects",
      subject: projectSubject,
      field: "coverUrl",
    });
    project.gallery.forEach((item, index) => {
      add(item.src, {
        section: "projects",
        subject: projectSubject,
        field: `gallery.${index}.src`,
      });
    });
    scanText(project.description, {
      section: "projects",
      subject: projectSubject,
      field: "description",
    });
    scanText(project.descriptionEn, {
      section: "projects",
      subject: projectSubject,
      field: "descriptionEn",
    });
  });

  pack.sections.posts.forEach((post) => {
    const postSubject = subject(post.title, post.titleEn, post.slug);
    add(post.coverUrl, {
      section: "posts",
      subject: postSubject,
      field: "coverUrl",
    });
    scanText(post.contentMarkdown, {
      section: "posts",
      subject: postSubject,
      field: "contentMarkdown",
    });
    scanText(post.contentEn, {
      section: "posts",
      subject: postSubject,
      field: "contentEn",
    });
  });

  return { references, truncated };
}
