import React from "react";
import { Composition } from "remotion";
import { MainV2 } from "./compositions/Main";
import { Vertical } from "./compositions/Vertical";
import { Teaser } from "./compositions/Teaser";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="main"     component={MainV2}  durationInFrames={780} fps={30} width={1920} height={1080} />
    <Composition id="vertical" component={Vertical} durationInFrames={780} fps={30} width={1080} height={1920} />
    <Composition id="teaser"   component={Teaser}   durationInFrames={300} fps={30} width={1920} height={1080} />
  </>
);
