import type { Metadata } from "next";
import localFont from "next/font/local";
import { getSiteAppearance } from "@/lib/content/queries";
import { getRequestLocale } from "@/lib/i18n/get-locale";
import { themeOverrideStyle } from "@/lib/theme";
import { getRequestTheme } from "@/lib/theme/get-theme";
import "./globals.css";

const display = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  variable: "--font-space",
  display: "swap",
  weight: "300 700",
});

const mono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  variable: "--font-code",
  display: "swap",
  weight: "100 800",
});

export const dynamic = "force-dynamic";

const siteUrl =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "IsMe",
    template: "%s // IsMe",
  },
  description: "A reusable personal homepage with CogDoc-powered knowledge base Q&A.",
  icons: {
    icon: "/icon.svg",
  },
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": "/feed.xml",
      "application/atom+xml": "/atom.xml",
    },
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme, locale, appearance] = await Promise.all([
    getRequestTheme(),
    getRequestLocale(),
    getSiteAppearance(),
  ]);
  const override = themeOverrideStyle(appearance.themeConfig);

  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      data-theme={theme}
      className={`${display.variable} ${mono.variable} h-full`}
      style={override}
    >
      <body className="flex min-h-full flex-col bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
