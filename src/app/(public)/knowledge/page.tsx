import type { Metadata } from "next";
import { normalizeQuery } from "@/lib/analytics/normalize-query";
import { ChatPanel } from "@/components/knowledge/ChatPanel";
import { Section } from "@/components/site/Section";
import { pickLocalized } from "@/lib/content/localize";
import { getPublicKnowledgeBases } from "@/lib/content/queries";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/get-locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: "knowledge",
    description: translate(locale, "knowledge.desc"),
    alternates: { canonical: "/knowledge" },
  };
}

function uniqueSuggestions(configured: string[], max = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of configured) {
    const key = normalizeQuery(q);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= max) break;
  }
  return out;
}

export default async function KnowledgePage() {
  const [modules, locale] = await Promise.all([
    getPublicKnowledgeBases(),
    getRequestLocale(),
  ]);
  const withHeat = modules.map((kbModule) => {
    const name = pickLocalized(locale, kbModule.name, kbModule.nameEn);
    const description = pickLocalized(locale, kbModule.description, kbModule.descriptionEn);
    const welcomeMessage = pickLocalized(
      locale,
      kbModule.welcomeMessage,
      kbModule.welcomeMessageEn,
    );
    const configured =
      locale === "en" && kbModule.suggestedQuestionsEn?.length
        ? kbModule.suggestedQuestionsEn
        : kbModule.suggestedQuestions;
    return {
      id: kbModule.id,
      name,
      slug: kbModule.slug,
      description,
      welcomeMessage,
      // Public suggestions are editorial content only. Raw visitor queries stay private
      // to the authenticated insights screen.
      suggestedQuestions: uniqueSuggestions(configured),
    };
  });

  const labels = {
    empty: translate(locale, "knowledge.empty"),
    select: translate(locale, "knowledge.select"),
    suggested: translate(locale, "knowledge.suggested"),
    send: translate(locale, "knowledge.send"),
    askPlaceholder: translate(locale, "knowledge.askPlaceholder"),
    you: translate(locale, "knowledge.you"),
    demo: translate(locale, "knowledge.demo"),
    cite: translate(locale, "knowledge.cite"),
    evidence: translate(locale, "knowledge.evidence"),
    feedbackUp: translate(locale, "knowledge.feedbackUp"),
    feedbackDown: translate(locale, "knowledge.feedbackDown"),
    feedbackRecorded: translate(locale, "knowledge.feedbackRecorded"),
    assistant: locale === "zh" ? "作品集助手" : "Portfolio assistant",
    working: locale === "zh" ? "正在检索资料并生成回答…" : "Reviewing sources and drafting an answer…",
    failure: locale === "zh" ? "暂时无法完成回答：" : "The answer could not be completed: ",
    conversation: locale === "zh" ? "问答记录" : "Conversation",
    questionLabel: locale === "zh" ? "输入你的问题" : "Enter your question",
    modulesLabel: locale === "zh" ? "知识主题" : "Knowledge topics",
  };

  return (
    <Section
      eyebrow={translate(locale, "knowledge.eyebrow")}
      title={translate(locale, "knowledge.title")}
      description={translate(locale, "knowledge.desc")}
    >
      <ChatPanel modules={withHeat} labels={labels} />
    </Section>
  );
}
