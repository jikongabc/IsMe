import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth/session";
import {
  getAdminProfile,
  listAdminFocusAreas,
  listAdminSocialLinks,
} from "@/lib/content/queries";
import { LinksAndFocus } from "./LinksAndFocus";
import { ProfileForm } from "./ProfileForm";

export default async function AdminProfilePage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [profile, links, areas] = await Promise.all([
    getAdminProfile(),
    listAdminSocialLinks(),
    listAdminFocusAreas(),
  ]);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">./profile</h1>
      <p className="mt-2 text-sm text-ink-muted">
        identity + optional english fields for locale switch
      </p>
      <div className="mt-8">
        <ProfileForm
          initial={{
            siteName: profile?.siteName ?? "IsMe",
            displayName: profile?.displayName ?? "",
            englishName: profile?.englishName ?? "",
            role: profile?.role ?? "",
            roleEn: profile?.roleEn ?? "",
            headline: profile?.headline ?? "",
            headlineEn: profile?.headlineEn ?? "",
            introduction: profile?.introduction ?? "",
            introductionEn: profile?.introductionEn ?? "",
            avatarUrl: profile?.avatarUrl ?? "",
            location: profile?.location ?? "",
            publicEmail: profile?.publicEmail ?? "",
            availability: profile?.availability ?? "",
            availabilityEn: profile?.availabilityEn ?? "",
          }}
        />
      </div>
      <LinksAndFocus links={links} areas={areas} />
    </div>
  );
}
