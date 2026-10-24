import fs from "node:fs";
const env = fs.readFileSync(".env","utf8");
const key = (env.match(/OPENROUTER_API_KEY=(.+)/)?.[1] || "").trim().replace(/^["']|["']$/g,"");
const models = ["openrouter/free","nvidia/nemotron-3.5-super-vl:free","google/gemma-4-31b-it:free","deepseek/deepseek-chat-v3.1:free","qwen/qwen3-235b-a22b:free","meta-llama/llama-3.3-70b-instruct:free"];
const tools = [{type:"function",function:{name:"get_headcount",description:"Get company headcount",parameters:{type:"object",properties:{department:{type:"string"}},required:[]}}}];
for (const model of models) {
  const t0 = Date.now();
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:"POST",
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","X-Title":"HCM Lite"},
      body: JSON.stringify({model, messages:[{role:"system",content:"You are an HCM assistant. Use tools for data."},{role:"user",content:"How many people work here in total?"}], tools, tool_choice:"auto"}),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json();
    const msg = j.choices?.[0]?.message;
    console.log(model, r.status, `${Date.now()-t0}ms`, "tool_calls:", JSON.stringify(msg?.tool_calls?.map(t=>t.function?.name)) ?? "none", "content:", (msg?.content||"").slice(0,60));
    if (j.error) console.log("   err:", (j.error.message||"").slice(0,120));
  } catch (e) { console.log(model, "FAIL", `${Date.now()-t0}ms`, String(e).slice(0,80)); }
}
