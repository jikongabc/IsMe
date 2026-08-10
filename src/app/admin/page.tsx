import Link from "next/link";
import { redirect } from "next/navigation";
import { BackupButton } from "@/components/admin/BackupButton";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { getChatStats } from "@/lib/analytics/chat-events";
import {
  getAdminProfile,
  listAdminExperiences,
  listAdminKnowledgeBases,
  listAdminPosts,
  listAdminProjects,
} from "@/lib/content/queries";
import { checkCogDocHealth } from "@/lib/cogdoc/admin-client";
import { countUnreadContacts } from "@/lib/contact/store";
import { getDb } from "@/lib/db";
import { siteProfiles } from "@/lib/db/schema";
import { isCogDocConfigured, isS3Configured } from "@/lib/env";
import { countGuestbookByStatus } from "@/lib/guestbook/store";
import { storageBackend } from "@/lib/media/storage";
import { getReadinessReport } from "@/lib/readiness/server";

export const dynamic = "force-dynamic";

async function collectHealth() {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  try {
    getDb().select({ id: siteProfiles.id }).from(siteProfiles).limit(1).all();
    checks.push({ name: "database", ok: true, detail: "sqlite ok" });
  } catch (error) {
    checks.push({
      name: "database",
      ok: false,
      detail: error instanceof Error ? error.message : "db error",
    });
  }

  if (isCogDocConfigured()) {
    const health = await checkCogDocHealth();
    checks.push({
      name: "cogdoc",
      ok: health.ok,
      detail: health.detail ?? (health.ok ? "online" : "offline"),
    });
  } else {
    checks.push({ name: "cogdoc", ok: true, detail: "demo mode" });
  }

  checks.push({
    name: "storage",
    ok: true,
    detail: isS3Configured() ? `s3 (${storageBackend()})` : "local ./public/uploads",
  });

  return checks;
}

export default async function AdminHomePage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const [
    profile,
    experiences,
    projects,
    posts,
    kbs,
    guestbook,
    unreadContacts,
    health,
    readiness,
  ] =
    await Promise.all([
      getAdminProfile(),
      listAdminExperiences(),
      listAdminProjects(),
      listAdminPosts(),
      listAdminKnowledgeBases(),
      Promise.resolve(countGuestbookByStatus()),
      Promise.resolve(countUnreadContacts()),
      collectHealth(),
      getReadinessReport(),
    ]);
  const chatStats = getChatStats();
  const healthOk = health.every((item) => item.ok);
  const launchIssues = readiness.items
    .filter((item) => item.status !== "pass")
    .sort((left, right) =>
      left.status === right.status ? 0 : left.status === "blocker" ? -1 : 1,
    )
    .slice(0, 4);
  const awaitingLinkAudit =
    !readiness.readyToShare && readiness.counts.blocker === 0 && readiness.linkChecks === undefined;
  const contentBlockers = readiness.items.filter(
    (item) =>
      item.status === "blocker" &&
      ["identity", "portfolio", "experience", "content"].includes(item.category),
  ).length;
  const needsCommissioning = contentBlockers > 0;

  const cards = [
    { label: "profile", value: profile?.displayName || "empty", href: "/admin/profile" },
    {
      label: "readiness",
      value: readiness.readyToShare
        ? `${readiness.score}/100`
        : awaitingLinkAudit
          ? "verify release"
          : `${readiness.counts.blocker} hold`,
      href: "/admin/readiness",
    },
    { label: "xp", value: String(experiences.length), href: "/admin/experiences" },
    { label: "projects", value: String(projects.length), href: "/admin/projects" },
    { label: "posts", value: String(posts.length), href: "/admin/posts" },
    { label: "media", value: "uploads", href: "/admin/media" },
    { label: "theme", value: "skin", href: "/admin/appearance" },
    { label: "kb", value: String(kbs.length), href: "/admin/knowledge-bases" },
    {
      label: "guestbook",
      value: guestbook.pending > 0 ? `${guestbook.pending} pending` : String(guestbook.total),
      href: "/admin/guestbook",
    },
    {
      label: "contact",
      value: unreadContacts > 0 ? `${unreadContacts} unread` : "inbox",
      href: "/admin/contact",
    },
    { label: "security", value: "passwd", href: "/admin/security" },
    { label: "insights", value: String(chatStats.totalQuestions), href: "/admin/insights" },
    { label: "audit", value: "log", href: "/admin/audit" },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">admin overview</h1>
      <p className="mt-2 text-sm text-ink-muted">
        secrets → <span className="text-accent">.env</span> · content →{" "}
        <span className="text-accent">sqlite</span>
      </p>

      <section
        className="mt-8 overflow-hidden rounded-2xl border border-accent/40 bg-bg-elevated"
        aria-labelledby="launch-studio-title"
      >
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="p-5 sm:p-7">
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">
              00 / commission your site
            </p>
            <h2
              id="launch-studio-title"
              className="mt-3 max-w-2xl font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl"
            >
              {needsCommissioning
                ? "把模板内容安全地换成你的履历"
                : "迁移、复查或重新发布你的个人内容"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">
              Launch Studio 会把示例清理、内容包导入、差异确认与发布体检串成一条可恢复的流程。正式内容只会在你审阅并确认后一次性写入。
            </p>
            <Link
              href="/admin/setup"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-btn-on-accent transition hover:brightness-110"
            >
              {needsCommissioning ? "开始个性化" : "打开 Launch Studio"}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="border-t border-line bg-bg-soft p-5 md:border-l md:border-t-0">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-faint">
              content gate
            </p>
            <p className="mt-3 font-display text-4xl text-ink">{contentBlockers}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {contentBlockers === 0 ? "内容阻断已清零" : "项内容任务待完成"}
            </p>
            <div className="mt-5 h-px bg-line" aria-hidden="true" />
            <p className="mt-4 text-xs leading-5 text-ink-faint">
              导入前预览 · 逐栏目选择 · SQLite 原子提交
            </p>
          </div>
        </div>
      </section>

      <section
        className={`mt-8 rounded-2xl border p-5 ${
          readiness.readyToShare
            ? "border-accent-2/40 bg-bg-elevated"
            : awaitingLinkAudit
              ? "border-warn/40 bg-bg-elevated"
              : "border-danger/40 bg-bg-elevated"
        }`}
        aria-labelledby="launch-readiness-title"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="launch-readiness-title" className="font-display text-xl text-ink">
            Résumé launch gate
          </h2>
          <span
            className={`font-mono text-xs ${
              readiness.readyToShare
                ? "text-accent-2"
                : awaitingLinkAudit
                  ? "text-warn"
                  : "text-danger"
            }`}
          >
            {readiness.readyToShare
              ? `${readiness.score}/100 · ready to review`
              : awaitingLinkAudit
                ? `${readiness.score}/100 · public verification pending`
                : `${readiness.counts.blocker} blocker · ${readiness.score}/100`}
          </span>
        </div>
        {launchIssues.length ? (
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {launchIssues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={issue.action?.href ?? "/admin/readiness"}
                  className="flex h-full items-center justify-between gap-3 rounded-lg border border-line bg-bg-soft p-3 text-ink-muted transition hover:border-accent hover:text-ink"
                >
                  <span>
                    <span
                      className={`mr-2 font-mono text-xs ${issue.status === "blocker" ? "text-danger" : "text-warn"}`}
                    >
                      {issue.status === "blocker" ? "BLOCK" : "WARN"}
                    </span>
                    {issue.title}
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            核心阻断已经清零；进入完整报告处理提醒并验证公开页面、链接与知识服务。
          </p>
        )}
        <Link
          href="/admin/readiness"
          className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-accent hover:text-ink"
        >
          打开完整发布体检 <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="terminal-window mt-8 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl text-accent">system health</h2>
          <span className={`font-mono text-xs ${healthOk ? "text-accent" : "text-danger"}`}>
            {healthOk ? "status ok" : "status degraded"}
          </span>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {health.map((item) => (
            <li key={item.name} className="flex flex-wrap justify-between gap-2">
              <span className="text-ink">
                <span className={item.ok ? "text-accent" : "text-danger"}>
                  {item.ok ? "●" : "○"}
                </span>{" "}
                {item.name}
              </span>
              <span className="font-mono text-xs text-ink-faint">{item.detail}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <BackupButton />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          cli: <span className="text-ink-muted">npm run backup</span> · docker:{" "}
          <span className="text-ink-muted">npm run backup:docker</span>
        </p>
      </section>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="terminal-window p-5 transition hover:border-accent"
          >
            <div className="text-xs text-ink-faint">./{card.label}</div>
            <div className="mt-2 font-display text-2xl text-ink">{card.value}</div>
          </Link>
        ))}
      </div>
      <div className="mt-8">
        <Link href="/" className="text-sm text-accent">
          ← back to public shell
        </Link>
      </div>
    </div>
  );
}
