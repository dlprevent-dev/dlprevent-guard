import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { MainV2 } from "./Main";
import { C } from "../design/tokens";
import { LogoMark, mono, Caption } from "../design/primitives";

// Vertical 1080x1920 — scales the 1920x1080 master to fit width, adds brand chrome top/bottom
export const Vertical: React.FC = () => {
  const { width, height } = useVideoConfig();
  const scale = width / 1920; // 0.5625 for 1080-wide
  const scaledH = 1080 * scale; // ≈ 608
  const chrome = (height - scaledH) / 2; // ≈ 656 each

  return (
    <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
      {/* top chrome */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: chrome, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <LogoMark size={56} />
          <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1 }}>AnveGuard</div>
        </div>
        <div style={{ fontFamily: mono, fontSize: 20, color: C.muted, letterSpacing: "0.32em", textTransform: "uppercase" }}>
          dispatch · 001 · live attack
        </div>
      </div>

      {/* center scaled video */}
      <div style={{ position: "absolute", top: chrome, left: 0, width, height: scaledH, overflow: "hidden", borderTop: `1px solid ${C.hairStrong}`, borderBottom: `1px solid ${C.hairStrong}` }}>
        <div style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <MainV2 />
        </div>
      </div>

      {/* bottom chrome */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: chrome, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: 80, textAlign: "center" }}>
        <div style={{ fontSize: 48, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2, maxWidth: 900 }}>
          Runtime governance<br />for autonomous AI.
        </div>
        <Caption>guard.citerlabs.com</Caption>
      </div>
    </AbsoluteFill>
  );
};
