"use client"

import { useState } from "react"

// shadcn components may not be installed; fallback to plain elements if missing.
export default function Home() {
  const [input, setInput] = useState("")
  const [reply, setReply] = useState("")
  const [loading, setLoading] = useState(false)

  async function send() {
    setLoading(true)
    setReply("")
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: input }] }),
      })
      const data = await res.json()
      setReply(data.content ?? data.error ?? "No response")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">Hackathon Starter</h1>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
        />
        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          onClick={send}
          disabled={loading || !input}
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
      {reply && (
        <div className="border rounded p-4 whitespace-pre-wrap">{reply}</div>
      )}
    </main>
  )
}
