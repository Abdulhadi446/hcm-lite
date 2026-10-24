import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export default function RootPage() {
  return (
    <Suspense fallback={null}>
      <RootRedirect />
    </Suspense>
  );
}

async function RootRedirect(): Promise<React.ReactNode> {
  const initialized = Boolean(
    queryOne<{ id: number }>("SELECT id FROM settings WHERE id = 1")
  );

  if (!initialized) {
    redirect("/setup");
  }

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  redirect("/dashboard");
}

