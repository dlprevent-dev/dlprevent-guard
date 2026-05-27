import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { C, FONTS } from "../../design/tokens";
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
  const { fps } = useVideoConfig();
  // BREACH stamp
  const breachIn = spring({ frame: f - 145, fps, config: { damping: 8, stiffness: 200 } });
  const flashOp = interpolate(f, [145, 148, 158], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitAll = interpolate(f, [175, 190], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "60px 120px", opacity: exitAll }}>
      <Mono size={14} color={C.muted}>act ii · scene 06 · breach in</Mono>

      <Tick n={3} at={10} />
      <Tick n={2} at={55} />
      <Tick n={1} at={100} />

      {/* flashing secrets */}
      {[
        { y: 200, t: "STRIPE_KEY=sk_live_********", d: 20 },
        { y: 880, t: "DATABASE_URL=postgres://****", d: 65 },
        { y: 760, t: "AWS_SECRET_ACCESS_KEY=****", d: 110 },
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

      {/* red full-screen flash on BREACH */}
      <div style={{
        position: "absolute", inset: 0, background: C.alert, opacity: flashOp * 0.85,
      }} />

      {/* BREACH stamp */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center",
        opacity: breachIn,
        transform: `scale(${interpolate(breachIn, [0, 1], [2.2, 1])})`,
      }}>
        <span style={{
          fontFamily: FONTS.sans, fontSize: 280, fontWeight: 700, color: "#fff",
          letterSpacing: -4, padding: "0 60px",
          border: `12px solid #fff`,
          textShadow: `0 0 40px rgba(0,0,0,0.6)`,
        }}>BREACH</span>
      </div>
    </AbsoluteFill>
  );
};
