import { redirect } from "next/navigation";
import { AppearanceForm } from "@/app/admin/appearance/AppearanceForm";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { getSiteAppearance } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const appearance = await getSiteAppearance();

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">appearance</h1>
      <p className="mt-2 text-sm text-ink-muted">
        default theme · visitor switcher · accent override · default locale
      </p>
      <div className="mt-8">
        <AppearanceForm
          initialTheme={appearance.theme}
          initialLocale={appearance.defaultLocale}
          initialConfig={appearance.themeConfig}
        />
      </div>
    </div>
  );
}
