import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, FONTS } from "../design/tokens";
import { Display, Mono, Rule, useEnter } from "../design/Type";

export const S1_ColdOpen: React.FC = () => {
  const f = useCurrentFrame();
  const stamp = useEnter(18);
  const live = useEnter(78);
  const tick = Math.floor(f / 2) % 60;
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper }}>
      {/* center rule */}
      <div style={{ position: "absolute", top: 540, left: 0, right: 0 }}>
        <Rule delay={0} width={"100%"} color={C.signal} />
      </div>
      {/* timestamp */}
      <div style={{ position: "absolute", left: 120, top: 472, ...stamp }}>
        <Mono size={16} color={C.muted} style={{ letterSpacing: 3 }}>
          {`02:14:${String(tick).padStart(2, "0")} UTC · INCIDENT EVT_A91F`}
        </Mono>
      </div>
      {/* headline below rule */}
      <div style={{ position: "absolute", left: 120, top: 580, right: 120 }}>
        <Display delay={36}>An AI agent is</Display>
        <Display delay={48} style={{ color: C.alert }}>being attacked.</Display>
      </div>
      {/* live strip */}
      <div style={{ position: "absolute", left: 120, bottom: 80, display: "flex", alignItems: "center", gap: 14, ...live }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.alert, boxShadow: `0 0 12px ${C.alert}`, opacity: 0.5 + 0.5 * Math.sin(f / 4) }} />
        <span style={{ fontFamily: FONTS.mono, fontSize: 16, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>
          live · prod-agent-7 · us-east-1 · runtime trace
        </span>
      </div>
      {/* wordmark top right */}
      <div style={{ position: "absolute", right: 120, top: 80, display: "flex", alignItems: "center", gap: 12, opacity: interpolate(f, [6, 24], [0, 1], { extrapolateRight: "clamp" }) }}>
        <svg width={22} height={22} viewBox="0 0 32 32" fill="none">
          <path d="M16 2 L28 8 V18 C28 24 22 29 16 30 C10 29 4 24 4 18 V8 Z" stroke={C.signal} strokeWidth={2} fill={`${C.signal}22`} />
        </svg>
        <span style={{ fontFamily: FONTS.mono, fontSize: 14, color: C.muted, letterSpacing: 3, textTransform: "uppercase" }}>AnveGuard</span>
      </div>
    </AbsoluteFill>
  );
};
