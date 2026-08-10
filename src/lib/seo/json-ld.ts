import { getEnv } from "@/lib/env";

export function siteBase(): string {
  return getEnv().SITE_URL.replace(/\/$/, "");
}

export function personJsonLd(input: {
  name: string;
  jobTitle?: string;
  description?: string;
  email?: string;
  location?: string;
  image?: string;
  sameAs?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    jobTitle: input.jobTitle || undefined,
    description: input.description || undefined,
    email: input.email || undefined,
    image: input.image || undefined,
    address: input.location
      ? { "@type": "PostalAddress", addressLocality: input.location }
      : undefined,
    url: siteBase(),
    sameAs: (input.sameAs ?? []).filter((url) => url.startsWith("http")),
  };
}

export function articleJsonLd(input: {
  title: string;
  description?: string;
  url: string;
  datePublished?: string | null;
  dateModified?: string | null;
  image?: string;
  authorName?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description || undefined,
    url: input.url,
    mainEntityOfPage: input.url,
    datePublished: input.datePublished || undefined,
    dateModified: input.dateModified || input.datePublished || undefined,
    image: input.image || undefined,
    author: {
      "@type": "Person",
      name: input.authorName || "IsMe",
    },
  };
}

export function projectJsonLd(input: {
  name: string;
  description?: string;
  url: string;
  image?: string;
  codeRepository?: string;
  demoUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: input.name,
    description: input.description || undefined,
    url: input.url,
    image: input.image || undefined,
    codeRepository: input.codeRepository || undefined,
    discussionUrl: input.demoUrl || undefined,
  };
}
