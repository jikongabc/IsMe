import Link from "next/link";
import { redirect } from "next/navigation";
import { listAuditLogs } from "@/lib/audit/log";
import { isAdminAuthenticated } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const rows = listAuditLogs(100);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-ink">audit</h1>
        <p className="mt-2 text-sm text-ink-muted">
          admin mutations + auth events · stored in sqlite · no secrets logged
        </p>
      </div>

      <section className="terminal-window p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted"># no audit events yet</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {rows.map((row) => (
              <li key={row.id} className="border-b border-line/60 pb-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={row.ok ? "text-accent" : "text-danger"}>
                    {row.action}
                    {!row.ok ? " !" : ""}
                  </span>
                  <span className="font-mono text-xs text-ink-faint">
                    {row.createdAt.replace("T", " ").slice(0, 19)} · {row.ip}
                  </span>
                </div>
                {row.target ? (
                  <div className="mt-1 font-mono text-xs text-ink-faint">target: {row.target}</div>
                ) : null}
                {row.detail ? (
                  <div className="mt-1 break-all font-mono text-xs text-ink-muted">{row.detail}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/admin" className="text-sm text-accent">
        ← overview
      </Link>
    </div>
  );
}
