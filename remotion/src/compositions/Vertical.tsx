import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { MainV2 } from "./Main";
import { C } from "../design/tokens";
import { LogoMark, mono, Caption } from "../design/primitives";

// Vertical 1080x1920 — scales the 1920x1080 master to fit width, adds brand chrome top/bottom
export const Vertical: React.FC = () => {
  const { width, height } = useVideoConfig();
  const scale = width / 1920;
  const scaledH = 1080 * scale; // = 608.x for 1080-wide
  const chrome = (height - scaledH) / 2;

  return (
    <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
      {/* top chrome */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: chrome, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <LogoMark size={48} />
          <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.025em" }}>AnveGuard</div>
        </div>
        <div style={{ fontFamily: mono, fontSize: 18, color: C.muted, letterSpacing: "0.32em", textTransform: "uppercase" }}>
          dispatch · 001
        </div>
      </div>

      {/* center scaled video */}
      <div style={{ position: "absolute", top: chrome, left: 0, width: 1920 * scale, height: scaledH, transform: `scale(${scale})`, transformOrigin: "top left", width: 1920, height: 1080 }}>
        <div style={{ position: "relative", width: 1920, height: 1080 }}>
          <MainV2 />
        </div>
      </div>
      {/* the trick: wrap MainV2 inside a fixed 1920x1080 box, then scale */}

      {/* bottom chrome */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: chrome, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 60 }}>
        <div style={{ fontSize: 40, fontWeight: 500, textAlign: "center", letterSpacing: "-0.02em", lineHeight: 1.2, maxWidth: 900 }}>
          Runtime governance for autonomous AI.
        </div>
        <Caption>guard.citerlabs.com</Caption>
      </div>
    </AbsoluteFill>
  );
};
