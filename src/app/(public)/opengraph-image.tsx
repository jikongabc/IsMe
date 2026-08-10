import { getPublicSiteBundle } from "@/lib/content/queries";
import { ogContentType, ogSize, renderOgCard } from "@/lib/og/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "IsMe";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  const { profile } = await getPublicSiteBundle();
  return renderOgCard({
    siteName: profile?.siteName || "IsMe",
    title: profile?.displayName || profile?.siteName || "IsMe",
    subtitle: profile?.headline || profile?.role || "Projects, experience, and source-grounded Q&A",
    eyebrow: "Interview dossier",
  });
}
