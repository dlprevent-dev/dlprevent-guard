// S8b_Capabilities — 305f, replaces the old S8 Receipts scene.
// Visualizes the four Wave-4 capabilities (Threat Intel · MCP · Replay · Cost)
// alongside topline numbers (186 tests, 22 sigs, 0 lock-in, 60s setup).
//
// Same dark-panel aesthetic as S8_Receipts so the cut looks intentional.

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, FONTS } from "../../design/tokens";
import { Mono, useEnter } from "../../design/Type";
import { NumberTicker } from "../../design/NumberTicker";

/** Compact stat tile — same pattern as Stat in S8_Receipts. */
const Stat: React.FC<{
  label: string;
  to: number;
  suffix?: string;
  color: string;
  delay: number;
  decimals?: number;
}> = ({ label, to, suffix, color, delay, decimals }) => (
  <div
    style={{
      background: C.panel,
      border: `1px solid ${C.rule}`,
      borderRadius: 12,
      padding: "18px 22px",
      ...useEnter(delay),
    }}
  >
    <Mono size={11} color={C.muted}>
      {label}
    </Mono>
    <div style={{ marginTop: 6 }}>
      <NumberTicker
        from={0}
        to={to}
        start={delay + 6}
        duration={50}
        suffix={suffix ?? ""}
        decimals={decimals ?? 0}
        size={48}
        color={color}
        weight={700}
        letterSpacing={-1.2}
      />
    </div>
  </div>
);

/** Capability row — title + one-line how-it-works. Slides in with `useEnter`. */
const Cap: React.FC<{
  tag: string;
  title: string;
  body: string;
  accent: string;
  delay: number;
}> = ({ tag, title, body, accent, delay }) => (
  <div
    style={{
      borderTop: `1px solid ${C.rule}`,
      padding: "16px 0",
      display: "flex",
      gap: 18,
      alignItems: "flex-start",
      ...useEnter(delay),
    }}
  >
    <div
      style={{
        width: 6,
        height: 56,
        background: accent,
        borderRadius: 4,
        marginTop: 2,
      }}
    />
    <div style={{ flex: 1, minWidth: 0 }}>
      <Mono size={11} color={C.muted}>
        {tag}
      </Mono>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: -0.4,
          marginTop: 2,
          color: C.paper,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 16,
          color: C.muted,
          marginTop: 6,
          lineHeight: 1.45,
        }}
      >
        {body}
      </div>
    </div>
  </div>
);

const CAPABILITIES = [
  {
    tag: "WAVE 4 · 01",
    title: "Community Threat Intelligence Feed",
    body:
      "22 curated signatures shipped. New jailbreak goes viral on Twitter, signature in the repo by morning, every workspace protected on the next hourly flush.",
    accent: C.alert,
    delay: 24,
  },
  {
    tag: "WAVE 4 · 02",
    title: "MCP Server Governance",
    body:
      "SHA-256 pinning of every trusted tool definition. When a compromised MCP server rewrites a tool's description, the hash mismatch fires before the call.",
    accent: C.signal,
    delay: 56,
  },
  {
    tag: "WAVE 4 · 03",
    title: "Counterfactual Policy Replay",
    body:
      "Re-run any past request log through hypothetical settings, get the would-be verdict. Test policy changes against real history before flipping switches.",
    accent: C.ok,
    delay: 88,
  },
  {
    tag: "WAVE 4 · 04",
    title: "Cost-Aware Enforcement",
    body:
      "Per-request USD-cost estimate against a hard ceiling. Blocks before the upstream call. 12 model rate cards built in. Triage doesn't speak cost.",
    accent: "#C77DFF",
    delay: 120,
  },
];

export const S8b_Capabilities: React.FC = () => {
  const f = useCurrentFrame();
  // Exit fade — start at 285, end at 305.
  const exit = interpolate(f, [285, 305], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONTS.sans,
        color: C.paper,
        padding: "60px 120px",
        opacity: exit,
      }}
    >
      <Mono size={14} color={C.muted}>
        act iv · scene 08 · capabilities
      </Mono>
      <div
        style={{
          fontSize: 56,
          fontWeight: 600,
          letterSpacing: -1.2,
          marginTop: 10,
          ...useEnter(4),
        }}
      >
        Four capabilities <span style={{ color: C.ok }}>Triage doesn't ship.</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.35fr 1fr",
          gap: 56,
          marginTop: 36,
          alignItems: "start",
        }}
      >
        {/* Left — capability list */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {CAPABILITIES.map((c, i) => (
            <Cap
              key={i}
              tag={c.tag}
              title={c.title}
              body={c.body}
              accent={c.accent}
              delay={c.delay}
            />
          ))}
        </div>

        {/* Right — topline stats grid (2×2) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
            ...useEnter(20),
          }}
        >
          <Stat
            label="ATTACK TESTS PASSING"
            to={186}
            color={C.ok}
            delay={20}
          />
          <Stat
            label="THREAT SIGNATURES"
            to={22}
            color={C.alert}
            delay={36}
          />
          <Stat
            label="SDKS LOCK-IN"
            to={0}
            color={C.signal}
            delay={52}
          />
          <Stat
            label="SECOND INTEGRATION"
            to={60}
            suffix="s"
            color={C.paper}
            delay={68}
          />

          {/* Bottom callout — "open source receipts" */}
          <div
            style={{
              gridColumn: "1 / -1",
              background: "#06090F",
              border: `1px solid ${C.rule}`,
              borderRadius: 12,
              padding: "16px 18px",
              marginTop: 8,
              ...useEnter(160),
            }}
          >
            <Mono size={11} color={C.muted}>
              REPRODUCIBLE
            </Mono>
            <div
              style={{
                fontSize: 16,
                fontFamily: FONTS.mono,
                color: C.paper,
                marginTop: 6,
              }}
            >
              git clone ANVE-AI/prompt-sentinel-flow
            </div>
            <div
              style={{
                fontSize: 13,
                color: C.muted,
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              Apache 2.0 — every signature, every detector, every test in the
              open.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
