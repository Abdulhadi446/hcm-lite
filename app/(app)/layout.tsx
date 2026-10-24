import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

function ShellFallback() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block w-64 shrink-0 border-r border-border bg-sidebar" />
      <div className="flex-1 p-6 space-y-4">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="h-64 rounded-lg border border-border bg-muted/40" />
      </div>
    </div>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}

async function AuthedShell({ children }: { children: React.ReactNode }) {
  const user: SessionUser | null = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
