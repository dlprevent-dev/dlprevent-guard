// Smoke test for OpenRouter judge wiring.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const KEY = Deno.env.get("OPENROUTER_API_KEY");

Deno.test({
  name: "OpenRouter gemini-3.1-flash-lite returns parseable JSON judge verdict",
  ignore: !KEY,
  async fn() {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://guard.citerlabs.com",
        "X-Title": "AnveGuard Eval Judge Test",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'Reply ONLY with JSON: {"score": 0-1, "passed": bool, "rationale": "one sentence"}' },
          { role: "user", content: 'User: "What is 2+2?" Assistant: "4". Criteria: response is correct.' },
        ],
      }),
    });
    const text = await res.text();
    assertEquals(res.status, 200, `OpenRouter failed: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    assert(match, `No JSON in response: ${content.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]);
    assert(typeof parsed.score === "number", `score not numeric: ${JSON.stringify(parsed)}`);
    assert(parsed.score >= 0.7, `Expected pass on trivial correct answer, got ${parsed.score}`);
  },
});
