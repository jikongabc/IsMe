export type PlaceholderMatch = {
  id: string;
  label: string;
};

const PLACEHOLDER_RULES: Array<PlaceholderMatch & { pattern: RegExp }> = [
  { id: "alex-river", label: "Alex River", pattern: /\balex\s+river\b/i },
  { id: "isme-demo", label: "IsMe Demo", pattern: /\bisme\s+demo\b/i },
  {
    id: "example-domain",
    label: "example.com / .org / .net",
    pattern: /(?:^|[@./])example\.(?:com|org|net)(?=$|[/:?#\s])/i,
  },
  {
    id: "example-university",
    label: "Example University / 示例大学",
    pattern: /\bexample\s+university\b|示例大学/i,
  },
  { id: "northwind-labs", label: "Northwind Labs", pattern: /\bnorthwind\s+labs\b/i },
  {
    id: "github-example",
    label: "github.com/example",
    pattern: /github\.com\/example(?:$|[/?#])/i,
  },
  {
    id: "replace-with",
    label: "replace-with-*",
    pattern: /\breplace-with(?:$|[-_\s])/i,
  },
  {
    id: "local-address",
    label: "localhost / loopback",
    pattern:
      /\blocalhost\b|(?:^|[/:])127(?:\.\d{1,3}){3}(?:$|[/:?#])|(?:^|[/:])\[?::1\]?(?:$|[/:?#])/i,
  },
  {
    id: "placeholder-copy",
    label: "占位内容 / placeholder content",
    pattern:
      /占位内容|这是\s*IsMe\s*模板[^。！？\n]*(?:占位|demo)|\bthis\s+is\s+(?:the\s+)?placeholder\s+(?:content|copy|data|profile|portfolio)\b|\bthis\s+(?:site|profile|portfolio|content)\s+(?:is|contains|uses)[^.!?\n]{0,80}\bplaceholder\b|\breplace\s+(?:this|the)\s+placeholder\s+(?:content|copy|data|profile|portfolio)\b/i,
  },
  {
    id: "demo-profile",
    label: "demo profile / demo 档案",
    pattern:
      /\bthis\s+is\s+(?:(?:a|the)\s+)?demo\s+(?:profile|portfolio|site)\b|\bthis\s+demo\s+(?:profile|portfolio|site)\b|demo\s*档案/i,
  },
];

function textValues(values: unknown): string[] {
  if (typeof values === "string") return [values];
  if (Array.isArray(values)) return values.flatMap(textValues);
  if (values && typeof values === "object") {
    return Object.values(values as Record<string, unknown>).flatMap(textValues);
  }
  return [];
}

export function findPlaceholderMatches(values: unknown): PlaceholderMatch[] {
  const text = textValues(values)
    .map((value) => value.normalize("NFKC"))
    .join("\n");
  if (!text.trim()) return [];

  return PLACEHOLDER_RULES.filter((rule) => rule.pattern.test(text)).map(({ id, label }) => ({
    id,
    label,
  }));
}

export function containsPlaceholder(values: unknown): boolean {
  return findPlaceholderMatches(values).length > 0;
}
