import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  DashboardMobileNav,
  DashboardSidebar,
} from "@/components/layout/DashboardSidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { CommandPaletteTrigger } from "@/components/layout/CommandPalette";
import { getServerSession } from "@/lib/server-auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth guard: any unauthenticated request to a `(dashboard)` route bounces
  // to /login. Done here (not middleware) so we can also pass session data
  // into the chrome below if/when needed.
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-white px-4 md:px-8">
          <div className="min-w-0 flex-1">
            <CommandPaletteTrigger />
          </div>
          <UserMenu />
        </header>
        <DashboardMobileNav />
        <main className="flex-1 px-4 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-content">
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
