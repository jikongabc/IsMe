"use client";

import { useEffect } from "react";
import Link from "next/link";

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
};

const actionStyle = {
  display: "inline-flex",
  minHeight: "44px",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #76a5ff",
  borderRadius: "11px",
  padding: "11px 16px",
  background: "#76a5ff",
  color: "#07111f",
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
} as const;

export default function GlobalError({ error, retry }: Props) {
  useEffect(() => {
    console.error("Unhandled root error", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <head>
        <title>页面暂时无法显示 · Something went wrong</title>
      </head>
      <body
        style={{
          margin: 0,
          background: "#0b1017",
          color: "#f3f7fb",
          fontFamily:
            'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
        }}
      >
        <main
          style={{
            display: "grid",
            minHeight: "100vh",
            placeItems: "center",
            padding: "24px",
          }}
        >
          <div
            role="alert"
            style={{
              width: "min(100%, 640px)",
              border: "1px solid rgba(201, 219, 238, 0.18)",
              borderRadius: "18px",
              background: "#111a24",
              padding: "clamp(24px, 6vw, 44px)",
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.24)",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#70e1c2",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              IsMe · recovery
            </p>
            <h1 style={{ margin: "14px 0 0", fontSize: "clamp(32px, 7vw, 52px)", lineHeight: 1.08 }}>
              页面暂时无法显示
            </h1>
            <p style={{ margin: "18px 0 0", color: "#b8c4d1", lineHeight: 1.7 }}>
              Something went wrong while loading this page. Please retry, or return to the home page.
            </p>
            {error.digest ? (
              <p style={{ margin: "14px 0 0", color: "#8f9fb0", fontSize: "12px" }}>
                Reference: {error.digest}
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "28px" }}>
              <button type="button" onClick={() => retry()} style={actionStyle}>
                重试 · Try again
              </button>
              <Link
                href="/"
                style={{
                  ...actionStyle,
                  borderColor: "rgba(201, 219, 238, 0.22)",
                  background: "transparent",
                  color: "#f3f7fb",
                }}
              >
                返回首页 · Home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
