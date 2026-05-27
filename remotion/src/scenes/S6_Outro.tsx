import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONTS, SPRING } from "../design/tokens";
import { useEnter } from "../design/Type";

export const S6_Outro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rule = spring({ frame: f - 6, fps, config: { damping: 30, stiffness: 80 } });
  const mark = spring({ frame: f - 26, fps, config: SPRING.accent });
  const tag = useEnter(56);
  const foot = useEnter(76);
  const fade = interpolate(f, [150, 180], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, alignItems: "center", justifyContent: "center", opacity: fade }}>
      <div style={{ width: "60%", height: 1, position: "relative", marginBottom: 64 }}>
        <div style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", width: `${rule * 100}%`, height: 1, background: C.signal, boxShadow: `0 0 16px ${C.signal}` }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24, opacity: mark, transform: `scale(${interpolate(mark, [0, 1], [0.94, 1])})` }}>
        <svg width={72} height={72} viewBox="0 0 32 32" fill="none">
          <path d="M16 2 L28 8 V18 C28 24 22 29 16 30 C10 29 4 24 4 18 V8 Z" stroke={C.signal} strokeWidth={2} fill={`${C.signal}22`} />
          <path d="M11 16 L15 20 L22 12" stroke={C.signal} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ fontSize: 120, fontWeight: 600, letterSpacing: -3, lineHeight: 1 }}>AnveGuard</div>
      </div>

      <div style={{ marginTop: 32, fontSize: 32, color: C.muted, fontWeight: 400, ...tag }}>
        The runtime firewall for AI agents.
      </div>

      <div style={{ marginTop: 64, fontFamily: FONTS.mono, fontSize: 16, color: C.mutedSoft, letterSpacing: 3, textTransform: "uppercase", ...foot }}>
        private beta · anveguard.com
      </div>
    </AbsoluteFill>
  );
};
