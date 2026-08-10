import {
  getPublishedProjectBySlug,
  getPublicSiteBundle,
} from "@/lib/content/queries";
import { pickLocalized } from "@/lib/content/localize";
import { getRequestLocale } from "@/lib/i18n/get-locale";
import { ogContentType, ogSize, renderOgCard } from "@/lib/og/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Project";
export const size = ogSize;
export const contentType = ogContentType;

type Props = { params: Promise<{ slug: string }> };

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const [project, { profile }, locale] = await Promise.all([
    getPublishedProjectBySlug(slug),
    getPublicSiteBundle(),
    getRequestLocale(),
  ]);
  const title = project
    ? pickLocalized(locale, project.name, project.nameEn)
    : slug;
  const subtitle = project
    ? pickLocalized(locale, project.summary, project.summaryEn)
    : "project case study";

  return renderOgCard({
    siteName: profile?.siteName || "IsMe",
    title,
    subtitle: subtitle || (locale === "zh" ? "项目案例" : "Project case study"),
    eyebrow: locale === "zh" ? "项目案例" : "Project case study",
  });
}
