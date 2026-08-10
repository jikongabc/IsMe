import type { Locale } from "@/lib/i18n";

export type ProjectMetric = {
  label?: string | null;
  value?: string | null;
  context?: string | null;
  labelEn?: string | null;
  valueEn?: string | null;
  contextEn?: string | null;
};

export type ProjectDecision = {
  title?: string | null;
  tradeoff?: string | null;
  titleEn?: string | null;
  tradeoffEn?: string | null;
};

export type ProjectGalleryItem = {
  src?: string | null;
  alt?: string | null;
  caption?: string | null;
  altEn?: string | null;
  captionEn?: string | null;
};

export type ProjectEvidenceSource = {
  role?: string | null;
  roleEn?: string | null;
  teamSize?: number | null;
  duration?: string | null;
  durationEn?: string | null;
  metrics?: ProjectMetric[] | null;
  decisions?: ProjectDecision[] | null;
  gallery?: ProjectGalleryItem[] | null;
};

type EvidenceFact = {
  label: string;
  value: string;
};

type LocalizedMetric = {
  label: string;
  value: string;
  context: string;
};

type LocalizedDecision = {
  title: string;
  tradeoff: string;
};

type LocalizedGalleryItem = {
  src: string;
  alt: string;
  caption: string;
};

export type ProjectEvidenceModel = {
  facts: EvidenceFact[];
  metrics: LocalizedMetric[];
  decisions: LocalizedDecision[];
  gallery: LocalizedGalleryItem[];
};

const COPY = {
  zh: {
    evidenceKicker: "证据账本",
    evidence: "快速了解",
    evidenceDescription: "先用职责、范围与结果建立项目上下文。",
    role: "我的角色",
    duration: "投入周期",
    team: "团队规模",
    teamValue: (size: number) => `${size} 人`,
    outcomes: "量化结果",
    decisions: "技术决策与取舍",
    decisionsDescription: "按实际决策顺序，说明选择以及为此接受的代价。",
    tradeoff: "取舍",
    galleryKicker: "交付记录",
    gallery: "成果画廊",
    galleryDescription: "项目界面、关键流程与最终交付结果。",
    galleryAlt: (projectName: string, index: number) =>
      `${projectName} 项目截图 ${index}`,
  },
  en: {
    evidenceKicker: "Evidence ledger",
    evidence: "At a glance",
    evidenceDescription: "Start with ownership, scope, and measurable outcomes.",
    role: "My role",
    duration: "Duration",
    team: "Team size",
    teamValue: (size: number) => `${size} ${size === 1 ? "person" : "people"}`,
    outcomes: "Measured outcomes",
    decisions: "Technical decisions and trade-offs",
    decisionsDescription: "The choices in sequence, including the costs accepted along the way.",
    tradeoff: "Trade-off",
    galleryKicker: "Delivered artifacts",
    gallery: "Outcome gallery",
    galleryDescription: "Product surfaces, critical flows, and delivered results.",
    galleryAlt: (projectName: string, index: number) =>
      `${projectName} project screenshot ${index}`,
  },
} as const;

function clean(value?: string | null): string {
  return (value ?? "").trim();
}

function localized(
  locale: Locale,
  primary?: string | null,
  english?: string | null,
): string {
  const fallback = clean(primary);
  return locale === "en" ? clean(english) || fallback : fallback;
}

export function buildProjectEvidence(
  source: ProjectEvidenceSource,
  locale: Locale,
  projectName: string,
): ProjectEvidenceModel {
  const copy = COPY[locale];
  const facts: EvidenceFact[] = [];
  const role = localized(locale, source.role, source.roleEn);
  const duration = localized(locale, source.duration, source.durationEn);
  const teamSize =
    typeof source.teamSize === "number" && Number.isFinite(source.teamSize)
      ? Math.floor(source.teamSize)
      : 0;

  if (role) facts.push({ label: copy.role, value: role });
  if (duration) facts.push({ label: copy.duration, value: duration });
  if (teamSize > 0) facts.push({ label: copy.team, value: copy.teamValue(teamSize) });

  const metrics = (source.metrics ?? []).flatMap((metric) => {
    const label = localized(locale, metric.label, metric.labelEn);
    const value = localized(locale, metric.value, metric.valueEn);
    if (!label || !value) return [];
    return [
      {
        label,
        value,
        context: localized(locale, metric.context, metric.contextEn),
      },
    ];
  });

  const decisions = (source.decisions ?? []).flatMap((decision) => {
    const title = localized(locale, decision.title, decision.titleEn);
    if (!title) return [];
    return [
      {
        title,
        tradeoff: localized(locale, decision.tradeoff, decision.tradeoffEn),
      },
    ];
  });

  const gallery = (source.gallery ?? [])
    .map((item) => ({ item, src: clean(item.src) }))
    .filter(({ src }) => Boolean(src))
    .map(({ item, src }, index) => ({
        src,
        alt:
          localized(locale, item.alt, item.altEn) ||
          copy.galleryAlt(projectName, index + 1),
        caption: localized(locale, item.caption, item.captionEn),
      }));

  return { facts, metrics, decisions, gallery };
}

export function ProjectEvidenceLedger({
  evidence,
  locale,
}: {
  evidence: ProjectEvidenceModel;
  locale: Locale;
}) {
  if (evidence.facts.length === 0 && evidence.metrics.length === 0) return null;
  const copy = COPY[locale];

  return (
    <section
      className="case-evidence-ledger mt-10"
      aria-labelledby="project-evidence-heading"
      aria-describedby="project-evidence-description"
    >
      <div>
        <p className="section-kicker">{copy.evidenceKicker}</p>
        <h2 id="project-evidence-heading" className="mt-2 font-display text-2xl text-ink">
          {copy.evidence}
        </h2>
        <p
          id="project-evidence-description"
          className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-faint"
        >
          {copy.evidenceDescription}
        </p>
      </div>

      {evidence.facts.length ? (
        <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          {evidence.facts.map((fact) => (
            <div key={fact.label} className="min-w-0 bg-bg-elevated p-4 md:p-5">
              <dt className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-ink-faint">
                {fact.label}
              </dt>
              <dd className="mt-2 break-words text-sm font-semibold leading-relaxed text-ink">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {evidence.metrics.length ? (
        <div className="mt-7 border-t border-line pt-5">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {copy.outcomes}
          </h3>
          <ul className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
            {evidence.metrics.map((metric, index) => (
              <li key={`${metric.label}-${index}`} className="case-metric bg-bg-elevated p-5">
                <strong className="block font-mono text-2xl tracking-[-0.04em] text-accent md:text-3xl">
                  {metric.value}
                </strong>
                <span className="mt-3 block text-sm font-semibold leading-snug text-ink">
                  {metric.label}
                </span>
                {metric.context ? (
                  <span className="mt-2 block text-xs leading-relaxed text-ink-faint">
                    {metric.context}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function ProjectDecisionLog({
  decisions,
  locale,
}: {
  decisions: ProjectEvidenceModel["decisions"];
  locale: Locale;
}) {
  if (decisions.length === 0) return null;
  const copy = COPY[locale];

  return (
    <section className="portfolio-card" aria-labelledby="project-decisions-heading">
      <h2 id="project-decisions-heading" className="font-display text-2xl text-ink">
        {copy.decisions}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-faint">
        {copy.decisionsDescription}
      </p>
      <ol className="mt-6 divide-y divide-line border-y border-line">
        {decisions.map((decision, index) => (
          <li key={`${decision.title}-${index}`} className="case-decision grid grid-cols-[auto_minmax(0,1fr)] gap-4 py-5">
            <span className="font-mono text-xs font-semibold text-accent" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-lg leading-snug text-ink">{decision.title}</h3>
              {decision.tradeoff ? (
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">{copy.tradeoff}: </span>
                  {decision.tradeoff}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ProjectGallery({
  items,
  locale,
}: {
  items: ProjectEvidenceModel["gallery"];
  locale: Locale;
}) {
  if (items.length === 0) return null;
  const copy = COPY[locale];

  return (
    <section className="case-gallery mt-12" aria-labelledby="project-gallery-heading">
      <div className="max-w-3xl">
        <p className="section-kicker">{copy.galleryKicker}</p>
        <h2 id="project-gallery-heading" className="mt-2 font-display text-3xl text-ink">
          {copy.gallery}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-faint">
          {copy.galleryDescription}
        </p>
      </div>
      <ul className="mt-6 grid gap-5 md:grid-cols-2">
        {items.map((item, index) => (
          <li key={`${item.src}-${index}`} className="case-gallery-item min-w-0">
            <figure className="overflow-hidden rounded-2xl border border-line bg-bg-elevated shadow-lg">
              {/* Gallery URLs are curated by the site owner and can be local or remote. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.alt}
                width={1600}
                height={900}
                loading="lazy"
                decoding="async"
                className="aspect-video h-auto w-full object-cover"
              />
              {item.caption ? (
                <figcaption className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-muted">
                  {item.caption}
                </figcaption>
              ) : null}
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
