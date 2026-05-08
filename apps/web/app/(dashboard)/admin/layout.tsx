import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-auth";
import { AdminNav } from "@/components/admin/AdminNav";

/**
 * Admin section guard. The outer (dashboard)/layout.tsx has already verified
 * the session — here we only need to check the `is_admin` flag on the user.
 *
 * NOTE: `user.is_admin` is being added to the shared session schema by the
 * parallel backend agent (see report). We read it defensively (`as any`) to
 * keep this guard working even if the type catches up after the schema PR.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const isAdmin =
    (session.user as unknown as { is_admin?: boolean })?.is_admin === true;
  if (!isAdmin) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Internal tools for support, ops, and trust &amp; safety reviews.
        </p>
      </header>
      <AdminNav />
      <div>{children}</div>
    </div>
  );
}
