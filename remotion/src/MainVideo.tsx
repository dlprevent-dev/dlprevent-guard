import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { Backdrop } from "./design/Backdrop";
import { scanWipe } from "./design/ScanWipe";
import { S1_ColdOpen }   from "./scenes/S1_ColdOpen";
import { S2_Agent }      from "./scenes/S2_Agent";
import { S2_Injection }  from "./scenes/S2_Injection";
import { S4_Compromise } from "./scenes/S4_Compromise";
import { S3_Detectors }  from "./scenes/S3_Detectors";
import { S4_Block }      from "./scenes/S4_Block";
import { S5_Audit }      from "./scenes/S5_Audit";
import { S8_Pillars }    from "./scenes/S8_Pillars";
import { S6_Outro }      from "./scenes/S6_Outro";

const timing = linearTiming({ durationInFrames: 18 });

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0A0E18" }}>
      <Backdrop />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={130}><S1_ColdOpen /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={180}><S2_Agent /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={240}><S2_Injection /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={200}><S4_Compromise /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={240}><S3_Detectors /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={240}><S4_Block /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={240}><S5_Audit /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={210}><S8_Pillars /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={250}><S6_Outro /></TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
