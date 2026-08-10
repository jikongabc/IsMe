"use client";

import { useEffect } from "react";
import Link from "next/link";

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function ErrorPage({ error, retry }: Props) {
  useEffect(() => {
    console.error("Unhandled route error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-2xl flex-col justify-center px-5 py-16">
      <div className="portfolio-card" role="alert">
        <p className="section-kicker">Something went wrong · 页面出现异常</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-ink">
          This page could not be displayed
        </h1>
        <p className="mt-4 leading-relaxed text-ink-muted">
          页面暂时无法显示。你可以重试；如果问题持续存在，请返回首页。
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-ink-faint">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-7 flex flex-wrap gap-3">
          <button type="button" onClick={() => retry()} className="btn-primary">
            Try again · 重试
          </button>
          <Link href="/" className="btn-ghost">
            Return home · 返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
