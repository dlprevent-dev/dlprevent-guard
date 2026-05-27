import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { C } from "./tokens";

export const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const zoom = interpolate(f, [0, durationInFrames], [1, 1.015]);
  const px = interpolate(f, [0, durationInFrames], [-4, 4]);
  const py = interpolate(f, [0, durationInFrames], [-3, 3]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #0E1426 0%, ${C.ink} 65%, #05070D 100%)`, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: -100,
          transform: `translate(${px}px, ${py}px) scale(${zoom})`,
          backgroundImage: `linear-gradient(${C.ruleSoft} 1px, transparent 1px), linear-gradient(90deg, ${C.ruleSoft} 1px, transparent 1px)`,
          backgroundSize: "96px 96px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
      {/* vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
