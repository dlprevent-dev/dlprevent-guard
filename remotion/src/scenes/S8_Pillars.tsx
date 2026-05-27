import React from "react";
import { useCurrentFrame, AbsoluteFill, interpolate } from "remotion";
import { C, FONTS } from "../design/tokens";
import { Mono, useEnter } from "../design/Type";

const Pillar: React.FC<{ n: string; title: string; body: string; delay: number }> = ({ n, title, body, delay }) => {
  const e = useEnter(delay);
  return (
    <div style={{
      ...e,
      background: C.panel,
      border: `1px solid ${C.rule}`,
      borderRadius: 14,
      padding: "30px 28px",
      minHeight: 320,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 14, color: C.signal, letterSpacing: 3 }}>{n}</div>
      <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.8, marginTop: 18, color: C.paper, lineHeight: 1.1 }}>
        {title}
      </div>
      <div style={{ fontSize: 19, color: C.muted, marginTop: 14, lineHeight: 1.55 }}>
        {body}
      </div>
      <div style={{ marginTop: "auto", height: 1, background: C.rule }} />
      <div style={{ marginTop: 14, fontFamily: FONTS.mono, fontSize: 13, color: C.mutedSoft, letterSpacing: 2, textTransform: "uppercase" }}>
        ships with sdk
      </div>
    </div>
  );
};

export const S8_Pillars: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "80px 120px" }}>
      <Mono size={16} color={C.muted}>chapter 06 · the runtime firewall</Mono>
      <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: -2, marginTop: 14, lineHeight: 1.04, ...useEnter(6) }}>
        Built like infrastructure.
      </div>
      <div style={{ marginTop: 14, fontSize: 26, color: C.muted, maxWidth: 1100, ...useEnter(18) }}>
        Three layers. One drop-in SDK. Zero changes to your agent.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28, marginTop: 56 }}>
        <Pillar n="01" title="Inspect"
          body="Every prompt, tool input, and tool output is scanned for injection, exfiltration, and policy violations — in under 15ms."
          delay={32} />
        <Pillar n="02" title="Enforce"
          body="Deny dangerous tool calls at runtime. Policy-as-code with semantic rules — not regex. Replay-safe."
          delay={50} />
        <Pillar n="03" title="Audit"
          body="Cryptographically signed event log of every decision. Replay any incident. Export to SIEM or Splunk."
          delay={68} />
      </div>

      <div style={{
        position: "absolute", left: 120, bottom: 56,
        opacity: interpolate(f, [110, 140], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        display: "flex", gap: 22, alignItems: "center",
      }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 14, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>integrates with</div>
        {["openai", "anthropic", "langchain", "vercel ai", "mcp"].map(s => (
          <div key={s} style={{ padding: "6px 12px", border: `1px solid ${C.ruleSoft}`, borderRadius: 6, fontFamily: FONTS.mono, fontSize: 13, color: C.paper, letterSpacing: 1 }}>
            {s}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
