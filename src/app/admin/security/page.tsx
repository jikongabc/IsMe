import { redirect } from "next/navigation";
import { hasDbPasswordOverride } from "@/lib/auth/password";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">security</h1>
      <p className="mt-2 text-sm text-ink-muted">
        change admin password · hash stored in sqlite · env password remains fallback until
        overridden
      </p>
      <div className="mt-8">
        <PasswordForm source={hasDbPasswordOverride() ? "database" : "env"} />
      </div>
    </div>
  );
}
