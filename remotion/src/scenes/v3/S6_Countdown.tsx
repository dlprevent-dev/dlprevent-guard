import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { C, FONTS, SPRING } from "../../design/tokens";
import { Mono } from "../../design/Type";

const Tick: React.FC<{ n: number; at: number }> = ({ n, at }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 12, stiffness: 200 } });
  const exit = interpolate(f, [at + 35, at + 50], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(s, exit);
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center",
      opacity,
      transform: `scale(${interpolate(s, [0, 1], [1.6, 1])})`,
    }}>
      <span style={{ fontFamily: FONTS.sans, fontSize: 380, fontWeight: 700, color: C.alert, letterSpacing: -10, fontVariantNumeric: "tabular-nums", filter: `drop-shadow(0 0 40px ${C.alert}60)` }}>
        0{n}
      </span>
    </div>
  );
};

export const S6_Countdown: React.FC = () => {
  const f = useCurrentFrame();
  // red rule sweep
  const sweep = interpolate(f, [150, 195], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitAll = interpolate(f, [180, 200], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "60px 120px", opacity: exitAll }}>
      <Mono size={14} color={C.muted}>act ii · scene 06 · breach in</Mono>

      <Tick n={3} at={10} />
      <Tick n={2} at={60} />
      <Tick n={1} at={110} />

      {/* flashing secrets */}
      {[
        { y: 200, t: "STRIPE_KEY=sk_live_********", d: 20 },
        { y: 880, t: "DATABASE_URL=postgres://****", d: 70 },
        { y: 760, t: "AWS_SECRET_ACCESS_KEY=****", d: 120 },
      ].map((s, i) => (
        <div key={i} style={{
          position: "absolute",
          top: s.y, left: i % 2 === 0 ? 120 : "auto", right: i % 2 === 0 ? "auto" : 120,
          fontFamily: FONTS.mono, fontSize: 18, color: C.alert,
          opacity: interpolate(f, [s.d, s.d + 8, s.d + 30, s.d + 40], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          letterSpacing: 1,
        }}>
          {s.t}
        </div>
      ))}

      {/* red sweep rule */}
      <div style={{
        position: "absolute", left: 0, right: 0, top: "50%",
        height: 2, background: C.alert,
        boxShadow: `0 0 30px ${C.alert}, 0 0 60px ${C.alert}80`,
        clipPath: `inset(0 ${(1 - sweep) * 100}% 0 0)`,
      }} />

      {/* breached label appears after sweep */}
      <div style={{
        position: "absolute", left: 0, right: 0, top: "57%", textAlign: "center",
        opacity: interpolate(f, [185, 200], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        fontFamily: FONTS.mono, fontSize: 16, color: C.alert, letterSpacing: 6, textTransform: "uppercase",
      }}>
        breached
      </div>
    </AbsoluteFill>
  );
};
