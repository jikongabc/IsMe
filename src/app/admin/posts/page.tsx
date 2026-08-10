import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { listAdminPosts } from "@/lib/content/queries";
import { PostsManager } from "./PostsManager";

export default async function AdminPostsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const items = await listAdminPosts();
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">./posts</h1>
      <p className="mt-2 text-sm text-ink-muted">markdown in, published pages out</p>
      <div className="mt-8">
        <PostsManager initial={items} />
      </div>
    </div>
  );
}
