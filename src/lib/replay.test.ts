/**
 * Tests for src/lib/replay.ts — the sessionStorage-based handoff that
 * lets a Logs detail panel stash a replay payload and the Playground
 * page consume it once on mount.
 *
 * Vitest's jsdom environment provides a working sessionStorage; each
 * test clears it via beforeEach for isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  stagePlaygroundReplay,
  consumePendingReplay,
  clearPendingReplay,
  lastUserMessage,
  payloadFromLogRow,
  type ReplayPayload,
} from "./replay";

beforeEach(() => {
  sessionStorage.clear();
});

const sample: ReplayPayload = {
  logId: "log-abc-123",
  apiKeyId: "key-xyz",
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is 2+2?" },
    { role: "assistant", content: "4." },
    { role: "user", content: "Now tell me about firewalls." },
  ],
  stream: true,
  capturedAt: "2026-05-18T08:00:00Z",
  originalVerdict: "allow",
};

// ---------- stagePlaygroundReplay ----------

describe("stagePlaygroundReplay", () => {
  it("stores the payload and returns the right URL", () => {
    const url = stagePlaygroundReplay(sample);
    expect(url).toBe("/dashboard/playground?replay=log-abc-123");
    expect(sessionStorage.getItem("replay:pending")).toBeTruthy();
  });

  it("URL-encodes weird log ids", () => {
    const url = stagePlaygroundReplay({ ...sample, logId: "log with spaces&stuff" });
    expect(url).toContain(encodeURIComponent("log with spaces&stuff"));
  });

  it("rejects empty messages", () => {
    expect(() => stagePlaygroundReplay({ ...sample, messages: [] }))
      .toThrow(/non-empty messages required/);
  });

  it("rejects missing logId", () => {
    expect(() => stagePlaygroundReplay({ ...sample, logId: "" }))
      .toThrow(/logId.*required/);
  });
});

// ---------- consumePendingReplay ----------

describe("consumePendingReplay", () => {
  it("returns null when nothing stashed", () => {
    expect(consumePendingReplay()).toBeNull();
  });

  it("returns the stashed payload and clears the slot", () => {
    stagePlaygroundReplay(sample);
    const got = consumePendingReplay();
    expect(got?.logId).toBe(sample.logId);
    expect(got?.messages).toHaveLength(4);
    // Slot is empty after consume — second call returns null
    expect(consumePendingReplay()).toBeNull();
  });

  it("returns null when stored JSON is malformed", () => {
    sessionStorage.setItem("replay:pending", "{not valid json");
    expect(consumePendingReplay()).toBeNull();
  });

  it("returns null when payload has no messages array", () => {
    sessionStorage.setItem("replay:pending", JSON.stringify({ logId: "x" }));
    expect(consumePendingReplay()).toBeNull();
  });

  it("filters out invalid messages but keeps the valid ones", () => {
    sessionStorage.setItem("replay:pending", JSON.stringify({
      logId: "log-1",
      messages: [
        { role: "user", content: "good" },
        null,
        { role: "user" }, // no content
        { content: "no role" },
        { role: "user", content: 42 }, // wrong type
        { role: "assistant", content: "also good" },
      ],
    }));
    const got = consumePendingReplay();
    expect(got?.messages).toHaveLength(2);
    expect(got?.messages[0]).toEqual({ role: "user", content: "good" });
    expect(got?.messages[1]).toEqual({ role: "assistant", content: "also good" });
  });

  it("caps message count at 200 to prevent OOM on malicious payload", () => {
    const big = Array.from({ length: 500 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    sessionStorage.setItem("replay:pending", JSON.stringify({
      logId: "log-1",
      messages: big,
    }));
    const got = consumePendingReplay();
    expect(got?.messages).toHaveLength(200);
  });

  it("returns null when filtered messages end up empty", () => {
    sessionStorage.setItem("replay:pending", JSON.stringify({
      logId: "log-1",
      messages: [{ junk: true }, { random: 1 }],
    }));
    expect(consumePendingReplay()).toBeNull();
  });
});

// ---------- clearPendingReplay ----------

describe("clearPendingReplay", () => {
  it("empties the slot", () => {
    stagePlaygroundReplay(sample);
    clearPendingReplay();
    expect(consumePendingReplay()).toBeNull();
  });

  it("is a no-op when nothing is stashed", () => {
    expect(() => clearPendingReplay()).not.toThrow();
  });
});

// ---------- lastUserMessage ----------

describe("lastUserMessage", () => {
  it("returns the last user message content", () => {
    expect(lastUserMessage(sample)).toBe("Now tell me about firewalls.");
  });

  it("returns empty string when no user messages", () => {
    const payload: ReplayPayload = {
      ...sample,
      messages: [{ role: "system", content: "sys" }, { role: "assistant", content: "a" }],
    };
    expect(lastUserMessage(payload)).toBe("");
  });

  it("ignores later assistant messages", () => {
    const payload: ReplayPayload = {
      ...sample,
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
      ],
    };
    expect(lastUserMessage(payload)).toBe("first");
  });
});

// ---------- payloadFromLogRow ----------

describe("payloadFromLogRow", () => {
  it("builds a valid payload from a typical log row", () => {
    const row = {
      id: "log-1",
      api_key_id: "key-1",
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
      created_at: "2026-05-18T08:00:00Z",
      verdict: "allow",
    };
    const p = payloadFromLogRow(row);
    expect(p).not.toBeNull();
    expect(p?.logId).toBe("log-1");
    expect(p?.apiKeyId).toBe("key-1");
    expect(p?.model).toBe("gpt-4o-mini");
    expect(p?.messages).toHaveLength(2);
  });

  it("returns null for missing or empty row", () => {
    expect(payloadFromLogRow(null)).toBeNull();
    expect(payloadFromLogRow(undefined)).toBeNull();
    expect(payloadFromLogRow({ id: "" })).toBeNull();
  });

  it("returns null when row has no usable messages", () => {
    expect(payloadFromLogRow({ id: "log-1" })).toBeNull();
    expect(payloadFromLogRow({ id: "log-1", messages: [] })).toBeNull();
    expect(payloadFromLogRow({ id: "log-1", messages: [{ junk: 1 }] })).toBeNull();
  });

  it("rejects non-chat roles", () => {
    expect(payloadFromLogRow({
      id: "log-1",
      messages: [{ role: "evil", content: "x" }, { role: "user", content: "ok" }],
    })?.messages).toHaveLength(1);
  });

  it("flattens multimodal content (array with text parts) to string", () => {
    const p = payloadFromLogRow({
      id: "log-1",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this" },
            { type: "image", image_url: "..." },
            { type: "text", text: "and tell me about it" },
          ],
        },
      ],
    });
    expect(p?.messages[0].content).toBe("Look at this\nand tell me about it");
  });

  it("falls back to JSON.stringify for unknown content shapes", () => {
    const p = payloadFromLogRow({
      id: "log-1",
      messages: [{ role: "user", content: { unknown: "shape" } }],
    });
    expect(p?.messages[0].content).toContain("unknown");
  });

  it("carries over verdict and block_reason for the 'replayed from' label", () => {
    const p = payloadFromLogRow({
      id: "log-1",
      messages: [{ role: "user", content: "x" }],
      verdict: "block",
      block_reason: "Matched keyword: 'jailbreak'",
    });
    expect(p?.originalVerdict).toBe("block");
    expect(p?.originalBlockReason).toBe("Matched keyword: 'jailbreak'");
  });
});

// ---------- round-trip ----------

describe("round-trip: stage → navigate → consume", () => {
  it("survives JSON serialization losslessly", () => {
    stagePlaygroundReplay(sample);
    const got = consumePendingReplay();
    expect(got).toEqual(sample);
  });
});
