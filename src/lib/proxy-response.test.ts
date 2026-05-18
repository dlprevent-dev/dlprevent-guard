/**
 * Tests for src/lib/proxy-response.ts — the shared parser that decides
 * SSE vs JSON, normalizes the anveguard verdict envelope, and surfaces
 * blocked-as-JSON responses correctly even when the client asked for
 * streaming.
 *
 * These are pure parser tests with synthetic Response objects; no
 * network, no Clerk. Run with `npm test` (vitest).
 */

import { describe, it, expect, vi } from "vitest";
import {
  detectProxyShape,
  parseProxyJson,
  parseProxySse,
  readProxyResponse,
} from "./proxy-response";

// ---------- helpers ---------------------------------------------------------

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(events: string[], init: { status?: number } = {}): Response {
  const body = events.join("");
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function sseEvent(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// ---------- detectProxyShape ------------------------------------------------

describe("detectProxyShape", () => {
  it("detects SSE from content-type", () => {
    const res = new Response("", { headers: { "content-type": "text/event-stream" } });
    expect(detectProxyShape(res)).toBe("sse");
  });

  it("detects SSE even with charset suffix", () => {
    const res = new Response("", { headers: { "content-type": "text/event-stream; charset=utf-8" } });
    expect(detectProxyShape(res)).toBe("sse");
  });

  it("defaults to JSON when content-type is missing", () => {
    const res = new Response("", { headers: {} });
    expect(detectProxyShape(res)).toBe("json");
  });

  it("treats application/json as JSON", () => {
    const res = new Response("{}", { headers: { "content-type": "application/json" } });
    expect(detectProxyShape(res)).toBe("json");
  });

  it("treats text/plain (unexpected) as JSON, not SSE", () => {
    const res = new Response("oops", { headers: { "content-type": "text/plain" } });
    expect(detectProxyShape(res)).toBe("json");
  });
});

// ---------- parseProxyJson --------------------------------------------------

describe("parseProxyJson — allowed responses", () => {
  it("parses a normal chat completion (verdict=allow)", async () => {
    const res = jsonResponse({
      id: "chatcmpl-123",
      choices: [{ message: { content: "Hello!" } }],
    });
    const r = await parseProxyJson(res);
    expect(r.shape).toBe("json");
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.text).toBe("Hello!");
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBe("allow");
  });

  it("handles a response with no choices array (raw text fallback)", async () => {
    const res = jsonResponse({ message: "Hi" });
    const r = await parseProxyJson(res);
    expect(r.blocked).toBe(false);
    // No choices[0].message.content → falls through to raw body text
    expect(r.text).toContain("Hi");
  });
});

describe("parseProxyJson — blocked responses (the critical path)", () => {
  it("surfaces the anveguard.blocked=true envelope", async () => {
    const res = jsonResponse({
      id: "chatcmpl-blocked-abc123",
      choices: [{ message: { content: "This request was blocked by your organization's AI policy." } }],
      anveguard: {
        blocked: true,
        reason: "Matched blocked keyword: 'ignore previous instructions'",
        verdict: "block",
        layers: [
          { layer: "keywords", verdict: "block", rule: "exact" },
          { layer: "injection", verdict: "block", rule: "ignore_prior_instructions" },
        ],
      },
    });
    const r = await parseProxyJson(res);
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe("block");
    expect(r.reason).toContain("ignore previous instructions");
    expect(r.layers).toHaveLength(2);
    expect(r.text).toBe("This request was blocked by your organization's AI policy.");
  });

  it("treats anveguard.blocked=false as not blocked even if present", async () => {
    const res = jsonResponse({
      choices: [{ message: { content: "OK" } }],
      anveguard: { blocked: false, layers: [{ layer: "heuristics", verdict: "flag" }] },
    });
    const r = await parseProxyJson(res);
    expect(r.blocked).toBe(false);
    expect(r.layers).toHaveLength(1);
  });

  it("falls back to verdict=allow when ok and no anveguard envelope", async () => {
    const res = jsonResponse({ choices: [{ message: { content: "ok" } }] });
    const r = await parseProxyJson(res);
    expect(r.verdict).toBe("allow");
    expect(r.blocked).toBe(false);
  });
});

describe("parseProxyJson — error responses", () => {
  it("surfaces error.message when status is non-2xx", async () => {
    const res = jsonResponse(
      { error: { message: "invalid_api_key", code: "invalid_api_key" } },
      { status: 401 },
    );
    const r = await parseProxyJson(res);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.text).toBe("invalid_api_key");
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBeUndefined(); // not ok → no allow default
  });

  it("returns the raw body when JSON parse fails", async () => {
    const res = new Response("<html>500 Internal Server Error</html>", {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    const r = await parseProxyJson(res);
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
    expect(r.text).toContain("500 Internal Server Error");
  });

  it("handles empty body without crashing", async () => {
    // Note: Response with status 204 forbids a body per spec; use 200 with
    // empty string body to exercise the same empty-text code path.
    const res = new Response("", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const r = await parseProxyJson(res);
    expect(r.data).toBeNull();
    expect(r.text).toBe("");
  });
});

describe("parseProxyJson — anveguard envelope edge cases", () => {
  it("anveguard is null", async () => {
    const res = jsonResponse({ choices: [{ message: { content: "x" } }], anveguard: null });
    const r = await parseProxyJson(res);
    expect(r.blocked).toBe(false);
  });

  it("anveguard is not an object (defensive)", async () => {
    const res = jsonResponse({ choices: [{ message: { content: "x" } }], anveguard: "weird" });
    const r = await parseProxyJson(res);
    expect(r.blocked).toBe(false);
  });

  it("surfaces detected_intent and intent_confidence", async () => {
    const res = jsonResponse({
      choices: [{ message: { content: "x" } }],
      anveguard: {
        blocked: false,
        detected_intent: "phishing_request",
        intent_confidence: 0.83,
      },
    });
    const r = await parseProxyJson(res);
    expect(r.detectedIntent).toBe("phishing_request");
    expect(r.intentConfidence).toBeCloseTo(0.83);
  });
});

// ---------- parseProxySse ---------------------------------------------------

describe("parseProxySse — streaming responses", () => {
  it("accumulates content deltas across multiple events", async () => {
    const res = sseResponse([
      sseEvent({ choices: [{ delta: { content: "Hello" } }] }),
      sseEvent({ choices: [{ delta: { content: ", " } }] }),
      sseEvent({ choices: [{ delta: { content: "world!" } }] }),
      "data: [DONE]\n\n",
    ]);
    const r = await parseProxySse(res);
    expect(r.shape).toBe("sse");
    expect(r.text).toBe("Hello, world!");
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBe("allow");
  });

  it("calls onDelta for each delta with accumulated text", async () => {
    const seen: string[] = [];
    const res = sseResponse([
      sseEvent({ choices: [{ delta: { content: "A" } }] }),
      sseEvent({ choices: [{ delta: { content: "B" } }] }),
    ]);
    await parseProxySse(res, {
      onDelta: (_chunk, acc) => seen.push(acc),
    });
    expect(seen).toEqual(["A", "AB"]);
  });

  it("detects blocked stream via anveguard envelope mid-stream", async () => {
    const onVerdict = vi.fn();
    const res = sseResponse([
      sseEvent({
        id: "chatcmpl-blocked-xyz",
        choices: [{ delta: { content: "This request was blocked." } }],
      }),
      sseEvent({
        choices: [{ delta: {}, finish_reason: "content_filter" }],
        anveguard: {
          blocked: true,
          reason: "Matched keyword: 'bomb'",
          verdict: "block",
        },
      }),
      "data: [DONE]\n\n",
    ]);
    const r = await parseProxySse(res, { onVerdict });
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe("block");
    expect(r.reason).toContain("bomb");
    expect(r.text).toContain("This request was blocked.");
    expect(onVerdict).toHaveBeenCalled();
  });

  it("treats finish_reason=content_filter as blocked even without anveguard envelope", async () => {
    const res = sseResponse([
      sseEvent({ choices: [{ delta: { content: "Sorry" }, finish_reason: "content_filter" }] }),
      "data: [DONE]\n\n",
    ]);
    const r = await parseProxySse(res);
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe("block");
  });

  it("handles incomplete frames at chunk boundaries", async () => {
    // Manually craft a body where one delta is split across two text-decoder reads
    const part1 = `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\ndata: {"chu`;
    const part2 = `nks":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n`;
    // Pass invalid second-frame partial: parser should skip rather than crash
    const res = new Response(part1 + part2, {
      headers: { "content-type": "text/event-stream" },
    });
    const r = await parseProxySse(res);
    // Partial JSON gets silently skipped, first event's "Hel" should land
    expect(r.text).toContain("Hel");
    expect(r.blocked).toBe(false);
  });

  it("returns the base result when res.body is null", async () => {
    const res = new Response(null, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    // jsdom Response with null body — exercise the early-return
    if (res.body === null) {
      const r = await parseProxySse(res);
      expect(r.text).toBe("");
      expect(r.blocked).toBe(false);
    }
  });

  it("handles CRLF line endings", async () => {
    const body = `data: ${JSON.stringify({ choices: [{ delta: { content: "x" } }] })}\r\ndata: [DONE]\r\n`;
    const res = new Response(body, {
      headers: { "content-type": "text/event-stream" },
    });
    const r = await parseProxySse(res);
    expect(r.text).toBe("x");
  });

  it("ignores non-data lines (e.g. SSE comments)", async () => {
    const body = `: this is a keepalive\n${sseEvent({ choices: [{ delta: { content: "y" } }] })}data: [DONE]\n\n`;
    const res = new Response(body, {
      headers: { "content-type": "text/event-stream" },
    });
    const r = await parseProxySse(res);
    expect(r.text).toBe("y");
  });
});

// ---------- readProxyResponse (one-shot router) -----------------------------

describe("readProxyResponse", () => {
  it("routes SSE responses to parseProxySse", async () => {
    const res = sseResponse([
      sseEvent({ choices: [{ delta: { content: "stream" } }] }),
      "data: [DONE]\n\n",
    ]);
    const r = await readProxyResponse(res);
    expect(r.shape).toBe("sse");
    expect(r.text).toBe("stream");
  });

  it("routes JSON responses to parseProxyJson", async () => {
    const res = jsonResponse({ choices: [{ message: { content: "json" } }] });
    const r = await readProxyResponse(res);
    expect(r.shape).toBe("json");
    expect(r.text).toBe("json");
  });

  it("the critical case: client asked for stream:true but proxy blocked → JSON response", async () => {
    // This is THE bug-prevention case from the file's docstring. Client requested
    // streaming; proxy refused with a JSON block response. readProxyResponse must
    // route via content-type, NOT via what the client requested.
    const res = jsonResponse({
      id: "chatcmpl-blocked-1",
      choices: [{ message: { content: "Blocked." } }],
      anveguard: { blocked: true, reason: "policy hit", verdict: "block" },
    });
    const r = await readProxyResponse(res, {
      onDelta: () => { throw new Error("onDelta should NOT be called on a JSON block"); },
    });
    expect(r.shape).toBe("json");
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe("block");
  });
});
