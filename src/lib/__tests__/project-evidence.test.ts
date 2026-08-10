import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildProjectEvidence,
  ProjectDecisionLog,
  ProjectEvidenceLedger,
  ProjectGallery,
} from "@/app/(public)/projects/_components/ProjectEvidence";

const source = {
  role: "技术负责人",
  roleEn: "Technical lead",
  duration: "六个月",
  durationEn: "",
  teamSize: 3,
  metrics: [
    {
      label: "查询延迟",
      labelEn: "Query latency",
      value: "降低 42%",
      valueEn: "42% lower",
      context: "生产环境 P95",
      contextEn: "Production P95",
    },
    { label: "", value: "99%" },
  ],
  decisions: [
    {
      title: "采用事件队列",
      titleEn: "Adopt an event queue",
      tradeoff: "接受最终一致性",
      tradeoffEn: "Accepted eventual consistency",
    },
    { title: "保留单体部署", tradeoff: "" },
    { title: "", tradeoff: "没有可理解的决策标题" },
  ],
  gallery: [
    { src: "", alt: "无效图片" },
    {
      src: "/uploads/dashboard.webp",
      alt: "数据看板",
      altEn: "Analytics dashboard",
      caption: "核心监控界面",
      captionEn: "Primary monitoring surface",
    },
    { src: "/uploads/flow.webp", alt: "", caption: "" },
  ],
};

describe("buildProjectEvidence", () => {
  it("localizes evidence, falls back to primary copy, and removes unusable entries", () => {
    const evidence = buildProjectEvidence(source, "en", "Signal Desk");

    expect(evidence.facts).toEqual([
      { label: "My role", value: "Technical lead" },
      { label: "Duration", value: "六个月" },
      { label: "Team size", value: "3 people" },
    ]);
    expect(evidence.metrics).toEqual([
      {
        label: "Query latency",
        value: "42% lower",
        context: "Production P95",
      },
    ]);
    expect(evidence.decisions).toHaveLength(2);
    expect(evidence.gallery).toEqual([
      {
        src: "/uploads/dashboard.webp",
        alt: "Analytics dashboard",
        caption: "Primary monitoring surface",
      },
      {
        src: "/uploads/flow.webp",
        alt: "Signal Desk project screenshot 2",
        caption: "",
      },
    ]);
  });

  it("keeps legacy projects empty instead of rendering placeholder evidence", () => {
    expect(buildProjectEvidence({}, "zh", "旧项目")).toEqual({
      facts: [],
      metrics: [],
      decisions: [],
      gallery: [],
    });
  });
});

describe("project evidence rendering", () => {
  it("renders facts as a description list and metrics as a non-sequential list", () => {
    const evidence = buildProjectEvidence(source, "zh", "信号台");
    const html = renderToStaticMarkup(
      createElement(ProjectEvidenceLedger, { evidence, locale: "zh" }),
    );

    expect(html).toContain('aria-labelledby="project-evidence-heading"');
    expect(html).toContain("<dl");
    expect(html).toContain("<ul");
    expect(html).toContain("技术负责人");
    expect(html).toContain("降低 42%");
  });

  it("renders ordered decisions and an accessible, lazy-loaded gallery", () => {
    const evidence = buildProjectEvidence(source, "en", "Signal Desk");
    const decisions = renderToStaticMarkup(
      createElement(ProjectDecisionLog, {
        decisions: evidence.decisions,
        locale: "en",
      }),
    );
    const gallery = renderToStaticMarkup(
      createElement(ProjectGallery, { items: evidence.gallery, locale: "en" }),
    );

    expect(decisions).toContain("<ol");
    expect(decisions).toContain("01");
    expect(decisions.indexOf("Adopt an event queue")).toBeLessThan(
      decisions.indexOf("保留单体部署"),
    );
    expect(gallery).toContain('alt="Analytics dashboard"');
    expect(gallery).toContain('alt="Signal Desk project screenshot 2"');
    expect(gallery).toContain('width="1600"');
    expect(gallery).toContain('height="900"');
    expect(gallery).toContain('loading="lazy"');
    expect(gallery).toContain("<figcaption");
  });

  it("renders no sections when optional evidence is absent", () => {
    const evidence = buildProjectEvidence({}, "en", "Legacy project");

    expect(
      renderToStaticMarkup(
        createElement(ProjectEvidenceLedger, { evidence, locale: "en" }),
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(ProjectDecisionLog, {
          decisions: evidence.decisions,
          locale: "en",
        }),
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(ProjectGallery, { items: evidence.gallery, locale: "en" }),
      ),
    ).toBe("");
  });
});
