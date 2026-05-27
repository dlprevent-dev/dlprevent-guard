import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { Backdrop } from "./design/Backdrop";
import { scanWipe } from "./design/ScanWipe";
import { S1_ColdOpen } from "./scenes/S1_ColdOpen";
import { S2_Injection } from "./scenes/S2_Injection";
import { S3_Detectors } from "./scenes/S3_Detectors";
import { S4_Block } from "./scenes/S4_Block";
import { S5_Audit } from "./scenes/S5_Audit";
import { S6_Outro } from "./scenes/S6_Outro";

const timing = linearTiming({ durationInFrames: 18 });

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0A0E18" }}>
      <Backdrop />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={130}><S1_ColdOpen /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={165}><S2_Injection /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={165}><S3_Detectors /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={165}><S4_Block /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={165}><S5_Audit /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={200}><S6_Outro /></TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
