import { redirect } from "next/navigation";
import { ReadinessDashboard } from "@/app/admin/readiness/ReadinessDashboard";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { getReadinessReport } from "@/lib/readiness/server";

export const dynamic = "force-dynamic";

export default async function AdminReadinessPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const report = await getReadinessReport();

  return <ReadinessDashboard initialReport={report} />;
}
