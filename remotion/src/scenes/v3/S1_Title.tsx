import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C, FONTS, SPRING } from "../../design/tokens";
import { Mono } from "../../design/Type";

const Word: React.FC<{ children: React.ReactNode; delay: number; color?: string }> = ({ children, delay, color = C.paper }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: SPRING.enter });
  return (
    <span style={{
      display: "inline-block",
      marginRight: 24,
      opacity: s,
      transform: `translateY(${interpolate(s, [0, 1], [28, 0])}px) perspective(800px) rotateX(${interpolate(s, [0, 1], [12, 0])}deg)`,
      color,
      transformOrigin: "bottom",
    }}>
      {children}
    </span>
  );
};

export const S1_Title: React.FC = () => {
  const f = useCurrentFrame();
  // underline draw under "employee"
  const ulProgress = interpolate(f, [56, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(f, [115, 130], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "0 120px", justifyContent: "center", opacity: exit }}>
      <div style={{ position: "absolute", top: 80, left: 120, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: C.signal, boxShadow: `0 0 12px ${C.signal}` }} />
        <Mono size={14} color={C.muted}>anveguard · launching on product hunt</Mono>
      </div>

      <div style={{ fontSize: 124, fontWeight: 600, letterSpacing: -3.5, lineHeight: 1.05, maxWidth: 1400 }}>
        <Word delay={4}>Your</Word>
        <Word delay={10}>AI</Word>
        <Word delay={16}>agent</Word>
        <Word delay={22}>is</Word>
        <Word delay={28}>a</Word>
        <br />
        <Word delay={34}>new</Word>
        <Word delay={40}>kind</Word>
        <Word delay={46}>of</Word>
        <span style={{ position: "relative", display: "inline-block" }}>
          <Word delay={52} color={C.signal}>employee.</Word>
          <svg
            style={{ position: "absolute", left: 0, right: 24, bottom: -14, width: "calc(100% - 24px)", height: 18, overflow: "visible" }}
            viewBox="0 0 100 4" preserveAspectRatio="none"
          >
            <line x1="0" y1="2" x2="100" y2="2"
              stroke={C.signal} strokeWidth="0.9"
              strokeDasharray="100"
              strokeDashoffset={100 * (1 - ulProgress)}
              style={{ filter: `drop-shadow(0 0 4px ${C.signal})` }} />
          </svg>
        </span>
      </div>

      <div style={{
        marginTop: 56,
        fontSize: 28, color: C.muted, fontWeight: 400, maxWidth: 900,
        opacity: interpolate(f, [80, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        transform: `translateY(${interpolate(f, [80, 100], [10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
      }}>
        With access to your code, your data, and your customers — and zero security clearance.
      </div>
    </AbsoluteFill>
  );
};
