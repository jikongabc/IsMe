import { redirect } from "next/navigation";
import { ContactAdmin } from "@/app/admin/contact/ContactAdmin";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { listAdminContacts } from "@/lib/contact/store";

export const dynamic = "force-dynamic";

export default async function AdminContactPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const items = listAdminContacts();

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">contact</h1>
      <p className="mt-2 text-sm text-ink-muted">
        inbound messages from /contact · honeypot + rate limit
      </p>
      <div className="mt-8">
        <ContactAdmin initial={items} />
      </div>
    </div>
  );
}
