import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { Backdrop } from "./design/Backdrop";
import { scanWipe } from "./design/ScanWipe";
import { S1_Title }       from "./scenes/v3/S1_Title";
import { S2_DayInLife }   from "./scenes/v3/S2_DayInLife";
import { S3_BlastRadius } from "./scenes/v3/S3_BlastRadius";
import { S4_Trap }        from "./scenes/v3/S4_Trap";
import { S5_Obeys }       from "./scenes/v3/S5_Obeys";
import { S6_Countdown }   from "./scenes/v3/S6_Countdown";
import { S7_Intercept }   from "./scenes/v3/S7_Intercept";
import { S8_Receipts }    from "./scenes/v3/S8_Receipts";
import { S9_Outro }       from "./scenes/v3/S9_Outro";

const t = linearTiming({ durationInFrames: 18 });

export const ProductHuntVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#0A0E18" }}>
    <Backdrop />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={130}><S1_Title /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={220}><S2_DayInLife /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={220}><S3_BlastRadius /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={220}><S4_Trap /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={220}><S5_Obeys /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={200}><S6_Countdown /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={260}><S7_Intercept /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={230}><S8_Receipts /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={244}><S9_Outro /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
