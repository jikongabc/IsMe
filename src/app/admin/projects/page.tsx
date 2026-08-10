import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { listAdminProjects } from "@/lib/content/queries";
import { ProjectsManager } from "./ProjectsManager";

export default async function AdminProjectsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const items = await listAdminProjects();
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">项目案例</h1>
      <p className="mt-2 max-w-3xl text-ink-muted">
        把项目整理成面试可讨论的案例：明确个人职责，用结果、技术取舍和图片建立证据链。
      </p>
      <div className="mt-8">
        <ProjectsManager initial={items} />
      </div>
    </div>
  );
}
