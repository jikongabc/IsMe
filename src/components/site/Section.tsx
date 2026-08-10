import type { ReactNode } from "react";

type Props = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  headingLevel?: 1 | 2;
  children: ReactNode;
};

export function Section({
  id,
  eyebrow,
  title,
  description,
  headingLevel = 2,
  children,
}: Props) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section id={id} className="content-section mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <div className="section-heading mb-10 max-w-3xl">
        {eyebrow ? (
          <p className="section-kicker mb-3">{eyebrow}</p>
        ) : null}
        <Heading className="font-display text-3xl font-semibold tracking-[-0.035em] text-ink md:text-4xl">
          {title}
        </Heading>
        {description ? (
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
