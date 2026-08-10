import { AdminNav } from "@/components/admin/AdminNav";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { countGuestbookByStatus } from "@/lib/guestbook/store";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdminAuthenticated();
  const pending = authed ? countGuestbookByStatus().pending : 0;

  return (
    <div className="min-h-full bg-bg">
      {authed ? <AdminNav guestbookPending={pending} /> : null}
      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  );
}
