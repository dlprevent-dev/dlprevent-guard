import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Backdrop } from "../design/Backdrop";
import { SceneFade, ScanWipe } from "../design/primitives";
import { C } from "../design/tokens";
import { S1Hook } from "../scenes/S1Hook";
import { S4Block } from "../scenes/S4Block";
import { S6Outro } from "../scenes/S6Outro";

// 10s teaser: 60 + 140 + 100 = 300 frames
export const Teaser: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = interpolate(f, [0, 8, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.ink, opacity: fade }}>
      <Backdrop />
      <Series>
        <Series.Sequence durationInFrames={60}><SceneFade total={60}><S1Hook total={60} /></SceneFade></Series.Sequence>
        <Series.Sequence durationInFrames={140}><SceneFade total={140}><S4Block total={140} /></SceneFade></Series.Sequence>
        <Series.Sequence durationInFrames={100}><SceneFade total={100}><S6Outro total={100} /></SceneFade></Series.Sequence>
      </Series>
      <ScanWipe at={54} dur={28} />
      <ScanWipe at={194} dur={28} />
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
