import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    })
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
    })
    return NextResponse.json({ content: completion.choices[0]?.message?.content ?? "" })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "LLM request failed" }, { status: 500 })
  }
}
