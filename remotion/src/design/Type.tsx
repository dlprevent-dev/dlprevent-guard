import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C, FONTS, SPRING } from "./tokens";

type P = { children: React.ReactNode; delay?: number; style?: React.CSSProperties; color?: string };

export const useEnter = (delay = 0) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: SPRING.enter });
  return {
    opacity: s,
    transform: `translateY(${interpolate(s, [0, 1], [14, 0])}px)`,
  };
};

export const useAccent = (delay = 0) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: SPRING.accent });
  return {
    opacity: interpolate(s, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
    transform: `scale(${interpolate(s, [0, 1], [0.94, 1])})`,
  };
};

export const Display: React.FC<P> = ({ children, delay = 0, style, color = C.paper }) => (
  <div style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: 168, letterSpacing: -5, lineHeight: 1.02, color, ...useEnter(delay), ...style }}>{children}</div>
);
export const H1: React.FC<P> = ({ children, delay = 0, style, color = C.paper }) => (
  <div style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: 96, letterSpacing: -2.5, lineHeight: 1.05, color, ...useEnter(delay), ...style }}>{children}</div>
);
export const H2: React.FC<P> = ({ children, delay = 0, style, color = C.paper }) => (
  <div style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: 56, letterSpacing: -1.2, lineHeight: 1.1, color, ...useEnter(delay), ...style }}>{children}</div>
);
export const Body: React.FC<P> = ({ children, delay = 0, style, color = C.paper }) => (
  <div style={{ fontFamily: FONTS.sans, fontWeight: 400, fontSize: 28, lineHeight: 1.4, color, ...useEnter(delay), ...style }}>{children}</div>
);
export const Mono: React.FC<P & { size?: number }> = ({ children, delay = 0, style, color = C.muted, size = 18 }) => (
  <div style={{ fontFamily: FONTS.mono, fontWeight: 500, fontSize: size, letterSpacing: 1.2, color, textTransform: "uppercase", ...useEnter(delay), ...style }}>{children}</div>
);

export const Rule: React.FC<{ delay?: number; width?: string | number; color?: string; style?: React.CSSProperties }> = ({ delay = 0, width = "100%", color = C.signal, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 30, stiffness: 90 } });
  return (
    <div style={{ width, height: 1, position: "relative", ...style }}>
      <div style={{ position: "absolute", left: "50%", top: 0, height: 1, width: `${s * 100}%`, transform: "translateX(-50%)", background: color, boxShadow: `0 0 14px ${color}80` }} />
    </div>
  );
};
