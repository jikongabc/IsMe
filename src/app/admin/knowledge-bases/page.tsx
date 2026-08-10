import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { listAdminKnowledgeBases } from "@/lib/content/queries";
import { KnowledgeBasesManager } from "./KnowledgeBasesManager";

export default async function AdminKnowledgeBasesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const items = await listAdminKnowledgeBases();
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">./kb</h1>
      <p className="mt-2 text-sm text-ink-muted">
        public slug for visitors · cogdoc kb id + pdf ingest stay server-side
      </p>
      <div className="mt-8">
        <KnowledgeBasesManager initial={items} />
      </div>
    </div>
  );
}
