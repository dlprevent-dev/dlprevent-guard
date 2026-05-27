import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { ProductHuntVideo } from "./ProductHuntVideo";

// Scene sum: 130+220+220+220+220+200+260+230+244 = 1944
// Minus 8 × 18f transition overlaps = 1800 effective frames = 60.0s @ 30fps
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="productHunt"
      component={ProductHuntVideo}
      durationInFrames={1800}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={1700}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
