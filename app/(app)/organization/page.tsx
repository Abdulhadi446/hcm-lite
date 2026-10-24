import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { OrganizationView } from "@/components/org/organization-view";
import type { Role } from "@/components/org/types";

function OrganizationFallback() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-3.5 w-72 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-9 w-full max-w-2xl animate-pulse rounded-lg bg-muted/60" />
      <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/30" />
    </div>
  );
}

export default async function OrganizationPage() {
  await connection();
  const user = await getSessionUser();

  if (!user) redirect("/login");
  if (user.role === "employee") redirect("/dashboard");

  return (
    <Suspense fallback={<OrganizationFallback />}>
      <OrganizationView role={user.role as Role} viewerId={user.id} />
    </Suspense>
  );
}
