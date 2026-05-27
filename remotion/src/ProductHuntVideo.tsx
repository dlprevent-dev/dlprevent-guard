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
// v4 durations tuned to VO: S1=170 S2=215 S3=180 S4=190 S5=215 S6=170 S7=300 S8=305 S9=199 = 1944
export const ProductHuntVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#0A0E18" }}>
    <Backdrop />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={170}><S1_Title /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={215}><S2_DayInLife /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={180}><S3_BlastRadius /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={190}><S4_Trap /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={215}><S5_Obeys /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={170}><S6_Countdown /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={300}><S7_Intercept /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={305}><S8_Receipts /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={scanWipe()} timing={t} />
      <TransitionSeries.Sequence durationInFrames={199}><S9_Outro /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
