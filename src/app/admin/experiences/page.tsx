import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { listAdminExperiences } from "@/lib/content/queries";
import { ExperiencesManager } from "./ExperiencesManager";

export default async function AdminExperiencesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const items = await listAdminExperiences();
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Experiences</h1>
      <p className="mt-2 text-ink-muted">Work, education, competitions, and other milestones.</p>
      <div className="mt-8">
        <ExperiencesManager initial={items} />
      </div>
    </div>
  );
}
