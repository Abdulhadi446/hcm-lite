import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { AiChat } from "@/components/ai/ai-chat";

export default async function AIPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <AiChat role={user.role} userName={user.name} />;
}
