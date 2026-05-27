import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Backdrop } from "../design/Backdrop";
import { SceneFade, ScanWipe } from "../design/primitives";
import { C } from "../design/tokens";
import { S1Hook } from "../scenes/S1Hook";
import { S2Injection } from "../scenes/S2Injection";
import { S3Detect } from "../scenes/S3Detect";
import { S4Block } from "../scenes/S4Block";
import { S5Audit } from "../scenes/S5Audit";
import { S6Outro } from "../scenes/S6Outro";

// 2.5s + 4s + 4.5s + 5s + 6s + 4s = 26s @ 30fps = 780 frames
const D = { s1: 75, s2: 120, s3: 135, s4: 150, s5: 180, s6: 120 };

export const MainV2: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // global vignette fade-in at very start and fade-out at very end
  const masterFade = interpolate(f, [0, 8, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // scan-line wipes at scene boundaries (start frames of S2..S6)
  const wipes = [D.s1, D.s1 + D.s2, D.s1 + D.s2 + D.s3, D.s1 + D.s2 + D.s3 + D.s4, D.s1 + D.s2 + D.s3 + D.s4 + D.s5];

  return (
    <AbsoluteFill style={{ background: C.ink, opacity: masterFade }}>
      <Backdrop />
      <Series>
        <Series.Sequence durationInFrames={D.s1}><SceneFade total={D.s1}><S1Hook total={D.s1} /></SceneFade></Series.Sequence>
        <Series.Sequence durationInFrames={D.s2}><SceneFade total={D.s2}><S2Injection total={D.s2} /></SceneFade></Series.Sequence>
        <Series.Sequence durationInFrames={D.s3}><SceneFade total={D.s3}><S3Detect total={D.s3} /></SceneFade></Series.Sequence>
        <Series.Sequence durationInFrames={D.s4}><SceneFade total={D.s4}><S4Block total={D.s4} /></SceneFade></Series.Sequence>
        <Series.Sequence durationInFrames={D.s5}><SceneFade total={D.s5}><S5Audit total={D.s5} /></SceneFade></Series.Sequence>
        <Series.Sequence durationInFrames={D.s6}><SceneFade total={D.s6}><S6Outro total={D.s6} /></SceneFade></Series.Sequence>
      </Series>
      {wipes.map((w) => <ScanWipe key={w} at={w - 6} dur={28} />)}
      {/* final vignette overlay (subtle) */}
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
