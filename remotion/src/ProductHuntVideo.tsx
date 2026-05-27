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

// Total = 1944f, minus 8 transitions × 18f = 1800f = 60s @ 30fps
// Sized to fit narration: S1=200 S2=220 S3=200 S4=150 S5=220 S6=190 S7=320 S8=260 S9=184
export const ProductHuntVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#0A0E18" }}>
    <Backdrop />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={200}><S1_Title /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={220}><S2_DayInLife /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={200}><S3_BlastRadius /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={150}><S4_Trap /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={220}><S5_Obeys /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={190}><S6_Countdown /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={320}><S7_Intercept /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={260}><S8_Receipts /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={184}><S9_Outro /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
