import Link from "next/link";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/get-locale";

export default async function NotFound() {
  const locale = await getRequestLocale();
  const projectsLabel = locale === "zh" ? "查看项目案例" : "Browse project case studies";

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col justify-center px-5 py-16">
      <div className="portfolio-card">
        <p className="section-kicker">404</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-ink md:text-5xl">
          {translate(locale, "notFound.title")}
        </h1>
        <p className="mt-4 max-w-lg leading-relaxed text-ink-muted">
          {translate(locale, "notFound.desc")}
        </p>
        <nav
          aria-label={locale === "zh" ? "页面导航" : "Page navigation"}
          className="mt-7 flex flex-wrap gap-3"
        >
          <Link href="/" className="btn-primary">
            {translate(locale, "notFound.home")}
          </Link>
          <Link href="/projects" className="btn-ghost">
            {projectsLabel}
          </Link>
        </nav>
      </div>
    </div>
  );
}
