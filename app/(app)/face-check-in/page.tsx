import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { FaceCheckInView } from "@/components/face/face-check-in-view";

// Session lookup is request data, so this route intentionally blocks instead
// of rendering a static shell. (cacheComponents validation opt-out.)
export const instant = false;

export default async function FaceCheckInPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Every signed-in role may open the page; the status endpoint decides whether
  // the account actually has an employee profile to check in with.
  return <FaceCheckInView role={user.role} />;
}
