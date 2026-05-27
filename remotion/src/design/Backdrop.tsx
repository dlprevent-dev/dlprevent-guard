import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "./tokens";

export const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  // subtle parallax drift on the grid
  const drift = (f * 0.25) % 64;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 25%, ${C.ink2} 0%, ${C.ink} 70%, #03050A 100%)` }}>
      <div
        style={{
          position: "absolute",
          inset: -64,
          backgroundImage: `linear-gradient(${C.hair} 1px, transparent 1px), linear-gradient(90deg, ${C.hair} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          transform: `translate(${-drift}px, ${-drift * 0.6}px)`,
          maskImage: "radial-gradient(ellipse 70% 60% at center, black 30%, transparent 80%)",
          opacity: 0.6,
        }}
      />
      {/* film grain via low-opacity noise dots */}
      {Array.from({ length: 18 }).map((_, i) => {
        const seed = i * 211.7;
        const x = (Math.sin(seed) * 0.5 + 0.5) * 1920;
        const y = ((Math.cos(seed * 1.7) * 0.5 + 0.5) * 1080 + f * 0.35) % 1080;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: 2, height: 2, borderRadius: 999, background: C.blue, opacity: 0.18 }} />;
      })}
      {/* vignette */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
