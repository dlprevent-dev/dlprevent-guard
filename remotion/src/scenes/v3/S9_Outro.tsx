import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C, FONTS, SPRING } from "../../design/tokens";
import { Mono } from "../../design/Type";

const WORD = "ANVEGUARD";

const Letter: React.FC<{ ch: string; delay: number }> = ({ ch, delay }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 14, stiffness: 180 } });
  return (
    <span style={{
      display: "inline-block",
      opacity: s,
      transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px) scale(${interpolate(s, [0, 1], [0.7, 1])})`,
    }}>{ch}</span>
  );
};

export const S9_Outro: React.FC = () => {
  const f = useCurrentFrame();
  const subReveal = interpolate(f, [60, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chipIn = interpolate(f, [110, 140], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dateIn = interpolate(f, [140, 170], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // hold and fade
  const exit = interpolate(f, [210, 244], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, justifyContent: "center", alignItems: "center", opacity: exit }}>
      {/* drifting particles */}
      {Array.from({ length: 24 }).map((_, i) => {
        const seed = i * 137.5;
        const x = (seed % 1800) + 60;
        const y = ((seed * 1.7) % 900) + 90;
        const drift = Math.sin((f + i * 8) / 40) * 6;
        return (
          <div key={i} style={{
            position: "absolute", left: x, top: y + drift,
            width: 2, height: 2, borderRadius: 999, background: C.signal,
            opacity: 0.25 + Math.sin((f + i * 15) / 30) * 0.15,
          }} />
        );
      })}

      <div style={{ fontSize: 200, fontWeight: 700, letterSpacing: 8, color: C.paper, fontFamily: FONTS.sans }}>
        {WORD.split("").map((ch, i) => <Letter key={i} ch={ch} delay={i * 4} />)}
      </div>

      {/* tagline with mask reveal */}
      <div style={{ position: "relative", overflow: "hidden", marginTop: 12 }}>
        <div style={{
          fontFamily: FONTS.sans, fontSize: 30, fontWeight: 400, color: C.muted, letterSpacing: 0.6,
          clipPath: `inset(0 ${(1 - subReveal) * 100}% 0 0)`,
        }}>
          The runtime firewall for AI agents.
        </div>
      </div>

      {/* CTA chip + launch date */}
      <div style={{
        marginTop: 60, display: "flex", gap: 18, alignItems: "center",
        opacity: chipIn,
        transform: `translateY(${interpolate(chipIn, [0, 1], [10, 0])}px)`,
      }}>
        <div style={{
          padding: "12px 22px",
          background: "rgba(91,141,239,0.1)",
          border: `1px solid ${C.signal}`,
          borderRadius: 999,
          fontFamily: FONTS.mono, fontSize: 15, color: C.signal,
          letterSpacing: 1.5, textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: C.signal, boxShadow: `0 0 8px ${C.signal}` }} />
          private beta · anveguard.dev
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 70, display: "flex", gap: 14, alignItems: "center",
        opacity: dateIn,
      }}>
        <Mono size={12} color={C.mutedSoft}>launching on product hunt</Mono>
        <span style={{ fontFamily: FONTS.mono, fontSize: 14, color: C.paper, letterSpacing: 1.5 }}>· may 28, 2026</span>
      </div>
    </AbsoluteFill>
  );
};
