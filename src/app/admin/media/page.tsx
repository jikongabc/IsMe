import { redirect } from "next/navigation";
import { MediaLibrary } from "@/app/admin/media/MediaLibrary";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { listUploads, storageBackend } from "@/lib/media/uploads";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const items = await listUploads();
  const backend = storageBackend();

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">media</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {backend === "s3" ? (
          <>
            storing in <span className="text-accent">S3-compatible</span> object storage · set{" "}
            <span className="text-accent">S3_PUBLIC_BASE_URL</span> for CDN links
          </>
        ) : (
          <>
            local uploads under <span className="text-accent">public/uploads</span> · optional S3 via
            env
          </>
        )}{" "}
        · pick from blog / profile forms
      </p>
      <div className="mt-8">
        <MediaLibrary initial={items} />
      </div>
    </div>
  );
}
