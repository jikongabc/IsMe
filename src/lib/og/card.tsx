import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

type OgCardInput = {
  siteName: string;
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

/** Shared interview-dossier Open Graph card. */
export function renderOgCard(input: OgCardInput) {
  const site = input.siteName || "IsMe";
  const title = input.title || site;
  const subtitle = input.subtitle || "";
  const eyebrow = input.eyebrow || "INTERVIEW DOSSIER";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(140deg, #0b1017 0%, #101b29 58%, #102824 100%)",
          color: "#f3f7fb",
          padding: "58px 64px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 54,
                height: 54,
                border: "1px solid #76a5ff",
                borderRadius: 13,
                background: "rgba(118,165,255,.12)",
                color: "#76a5ff",
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: ".08em",
              }}
            >
              IS
            </div>
            <span style={{ color: "#70e1c2", fontSize: 22, fontWeight: 700, letterSpacing: ".12em" }}>
              {eyebrow.toUpperCase()}
            </span>
          </div>
          <span style={{ color: "#b8c4d1", fontSize: 25 }}>{site}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", width: 76, height: 6, borderRadius: 99, background: "#76a5ff" }} />
          <div
            style={{
              fontSize: title.length > 48 ? 55 : 75,
              lineHeight: 1.06,
              fontWeight: 700,
              letterSpacing: "-0.045em",
              maxWidth: 1040,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontSize: 30,
                color: "#b8c4d1",
                maxWidth: 960,
                lineHeight: 1.35,
              }}
            >
              {subtitle.slice(0, 160)}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(201,219,238,.18)",
            paddingTop: 24,
            color: "#8f9fb0",
            fontSize: 21,
          }}
        >
          <span>WORK · EXPERIENCE · WRITING</span>
          <span style={{ color: "#70e1c2" }}>SOURCE-GROUNDED Q&amp;A →</span>
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
