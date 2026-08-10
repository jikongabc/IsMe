import { redirect } from "next/navigation";
import { LaunchStudio } from "./LaunchStudio";
import {
  normalizeSetupSnapshot,
  projectReadiness,
} from "./models";
import { isAdminAuthenticated } from "@/lib/auth/session";
import {
  createPortfolioSetupSnapshot,
  readCurrentPortfolioPack,
} from "@/lib/portfolio-pack/server";
import { buildReadinessReport } from "@/lib/readiness/report";
import { loadReadinessInput } from "@/lib/readiness/server";

export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const readinessInput = await loadReadinessInput();
  const report = buildReadinessReport(readinessInput);
  const snapshot = normalizeSetupSnapshot(
    createPortfolioSetupSnapshot(readCurrentPortfolioPack(), readinessInput),
  );
  if (!snapshot) throw new Error("Launch Studio snapshot failed contract validation");

  return (
    <LaunchStudio
      initialSnapshot={snapshot}
      initialReadiness={projectReadiness(report)}
    />
  );
}
