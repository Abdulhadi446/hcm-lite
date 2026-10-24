import { headers } from "next/headers";
import { ensureEnvAdmin, queryOne } from "@/lib/db";

// Force request-time execution: DB state may change between requests,
// and cacheComponents would otherwise prerender this handler at build.
export async function GET() {
  await headers();

  // First-run env bypass: auto-create company + admin from ADMIN_EMAIL/ADMIN_PASSWORD.
  ensureEnvAdmin();

  const initialized = !!queryOne("SELECT id FROM settings WHERE id = 1");
  return Response.json({ initialized });
}
