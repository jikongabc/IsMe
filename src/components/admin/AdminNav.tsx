"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/admin", label: "概览" },
  { href: "/admin/setup", label: "首发工作台" },
  { href: "/admin/readiness", label: "发布体检" },
  { href: "/admin/profile", label: "资料" },
  { href: "/admin/experiences", label: "经历" },
  { href: "/admin/projects", label: "项目" },
  { href: "/admin/posts", label: "文章" },
  { href: "/admin/media", label: "媒体" },
  { href: "/admin/appearance", label: "外观" },
  { href: "/admin/knowledge-bases", label: "知识库" },
  { href: "/admin/guestbook", label: "留言" },
  { href: "/admin/contact", label: "联系" },
  { href: "/admin/insights", label: "洞察" },
  { href: "/admin/security", label: "安全" },
  { href: "/admin/audit", label: "审计" },
];

type Props = {
  guestbookPending?: number;
};

function AdminLinks({
  pathname,
  guestbookPending,
  mobile = false,
}: {
  pathname: string;
  guestbookPending: number;
  mobile?: boolean;
}) {
  return (
    <ul className={mobile ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-x-3 gap-y-2"}>
      {links.map((link) => {
        const active = pathname === link.href;
        const showBadge = link.href === "/admin/guestbook" && guestbookPending > 0;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={
                mobile
                  ? `block rounded-lg px-3 py-2 text-sm ${active ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-bg-soft hover:text-ink"}`
                  : active
                    ? "text-accent"
                    : "text-ink-muted hover:text-ink"
              }
            >
              {link.label}
              {showBadge ? (
                <span className="ml-1 font-mono text-danger">({guestbookPending})</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminNav({ guestbookPending = 0 }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const currentLabel = links.find((link) => link.href === pathname)?.label ?? "菜单";

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="border-b border-line bg-bg-elevated">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="hidden items-center justify-between gap-5 md:flex">
          <span className="text-accent">admin$</span>
          <nav aria-label="管理后台" className="min-w-0 flex-1 text-xs lg:text-sm">
            <AdminLinks pathname={pathname} guestbookPending={guestbookPending} />
          </nav>
          <button
            type="button"
            data-navigation="logout"
            onClick={() => void logout()}
            className="text-xs text-ink-faint transition hover:text-danger md:text-sm"
          >
            退出
          </button>
        </div>

        <details className="admin-mobile-menu md:hidden">
          <summary className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line bg-bg-soft px-3 text-sm text-ink">
            <span className="font-mono text-accent">admin$</span>
            <span>{currentLabel} · 菜单</span>
          </summary>
          <div className="mt-2 rounded-xl border border-line bg-bg-elevated p-3 shadow-lg">
            <nav aria-label="管理后台">
              <AdminLinks pathname={pathname} guestbookPending={guestbookPending} mobile />
            </nav>
            <button
              type="button"
              data-navigation="logout"
              onClick={() => void logout()}
              className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-danger"
            >
              退出后台
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
