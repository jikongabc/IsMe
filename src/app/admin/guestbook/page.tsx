import { redirect } from "next/navigation";
import { GuestbookAdmin } from "@/app/admin/guestbook/GuestbookAdmin";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { listAdminGuestbook } from "@/lib/guestbook/store";

export const dynamic = "force-dynamic";

export default async function AdminGuestbookPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const items = listAdminGuestbook();

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">guestbook</h1>
      <p className="mt-2 text-sm text-ink-muted">
        moderate public notes · pending until approved · honeypot + rate limit on submit
      </p>
      <div className="mt-8">
        <GuestbookAdmin initial={items} />
      </div>
    </div>
  );
}
