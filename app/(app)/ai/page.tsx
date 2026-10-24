import { PagePlaceholder } from "@/components/page-placeholder"

export default function AIPage() {
  return (
    <PagePlaceholder
      title="AI Assistant"
      purpose="Chat assistant that answers only from your database via tool calling."
      capabilities={[
        "Chat panel; model picks a tool and the backend runs it with the caller's scope.",
        "Dashboard summary from live data.",
        "Smart leave: sentence → validated JSON → pre-filled form.",
        "Policy Q&A; refuses to reveal other people's salary.",
        "Rate limit 20 req/user/hr, 15 s timeout, friendly fallback, answers labelled AI-generated.",
      ]}
    />
  )
}
