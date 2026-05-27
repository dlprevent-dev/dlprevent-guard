import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Easing } from "remotion";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { C } from "./tokens";

export const { fontFamily: mono } = loadMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
export const { fontFamily: sans } = loadSans("normal", { weights: ["300", "400", "500", "600", "700"], subsets: ["latin"] });

export const ease = Easing.bezier(0.22, 0.61, 0.36, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

// canonical entrance: mask-reveal up + 8px settle, ~22f
export const useEntrance = (delay = 0, dur = 22) => {
  const f = useCurrentFrame();
  const p = interpolate(f - delay, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  return { opacity: p, transform: `translateY(${interpolate(p, [0, 1], [10, 0])}px)`, filter: `blur(${interpolate(p, [0, 1], [4, 0])}px)` };
};

// canonical exit: blur + fade
export const useExit = (start: number, dur = 16) => {
  const f = useCurrentFrame();
  const p = interpolate(f - start, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  return { opacity: 1 - p, filter: `blur(${p * 6}px)` };
};

// soft scene fade wrapper (in 12f / out 12f)
export const SceneFade: React.FC<{ children: React.ReactNode; total: number; inDur?: number; outDur?: number }> = ({ children, total, inDur = 12, outDur = 14 }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, inDur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const b = interpolate(f, [total - outDur, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(a, b) }}>{children}</div>;
};

// breathing zoom — 1.5% over scene duration
export const useBreath = (total: number, amount = 0.015) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, total], [0, 1]);
  return { transform: `scale(${1 + p * amount})`, transformOrigin: "center" };
};

export const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: C.panelSolid,
    border: `1px solid ${C.hair}`,
    borderRadius: 12,
    boxShadow: `0 1px 0 rgba(255,255,255,0.04) inset, 0 30px 80px -40px rgba(0,0,0,0.6)`,
    ...style,
  }}>{children}</div>
);

export const Hairline: React.FC<{ length?: number | string; vertical?: boolean; color?: string; style?: React.CSSProperties }> = ({ length = 24, vertical, color = C.hairStrong, style }) => (
  <div style={{
    width: vertical ? 1 : length,
    height: vertical ? length : 1,
    background: color,
    ...style,
  }} />
);

export const Caption: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone = C.muted }) => (
  <div style={{ fontFamily: mono, fontSize: 14, color: tone, letterSpacing: "0.18em", textTransform: "uppercase" }}>{children}</div>
);

export const LogoMark: React.FC<{ size?: number; color?: string }> = ({ size = 32, color = C.blue }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M16 2.5 L27.5 8.2 V18 C27.5 23.5 22 28.5 16 29.5 C10 28.5 4.5 23.5 4.5 18 V8.2 Z" stroke={color} strokeWidth={1.6} fill={`${color}14`} />
    <path d="M11 16 L14.5 19.5 L21.5 12.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// thin animated chapter bars (top/bottom)
export const ChapterBars: React.FC<{ inAt?: number; outAt?: number; height?: number }> = ({ inAt = 0, outAt = 9999, height = 36 }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [inAt, inAt + 16, outAt - 12, outAt], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  return (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height, background: C.ink, transform: `translateY(${(1 - p) * -height}px)`, zIndex: 50 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height, background: C.ink, transform: `translateY(${(1 - p) * height}px)`, zIndex: 50 }} />
    </>
  );
};

// scan-line wipe — single transition ritual used in/out of scenes
export const ScanWipe: React.FC<{ at: number; dur?: number; color?: string }> = ({ at, dur = 24, color = C.blue }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  if (p <= 0 || p >= 1) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 60 }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${p * 100}%`, width: 2, background: color, boxShadow: `0 0 18px ${color}, 0 0 60px ${color}80` }} />
    </div>
  );
};

// status strip — used in S1
export const StatusStrip: React.FC<{ items: { k: string; v: string; tone?: string }[]; opacity?: number }> = ({ items, opacity = 1 }) => (
  <div style={{ display: "flex", gap: 28, alignItems: "center", opacity }}>
    {items.map((it, i) => (
      <React.Fragment key={i}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.mutedDim, letterSpacing: "0.18em", textTransform: "uppercase" }}>{it.k}</span>
          <span style={{ fontFamily: mono, fontSize: 14, color: it.tone ?? C.paper, letterSpacing: "0.06em" }}>{it.v}</span>
        </div>
        {i < items.length - 1 && <div style={{ width: 1, height: 12, background: C.hairStrong }} />}
      </React.Fragment>
    ))}
  </div>
);

export const RuleDraw: React.FC<{ at: number; dur?: number; width?: number; color?: string; style?: React.CSSProperties }> = ({ at, dur = 26, width = 240, color = C.blue, style }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return <div style={{ width: width * p, height: 2, background: color, ...style }} />;
};

export { useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill };
