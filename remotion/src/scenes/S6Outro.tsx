import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { sans, mono, useEntrance, LogoMark, RuleDraw, ChapterBars, Caption, easeOut } from "../design/primitives";
import { C, TYPE } from "../design/tokens";

export const S6Outro: React.FC<{ total: number }> = ({ total }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoS = spring({ frame: f - 6, fps, config: { damping: 18, stiffness: 110 } });
  const lineIn = useEntrance(30, 22);
  const subIn = useEntrance(48, 22);
  const ctaIn = useEntrance(68, 22);

  return (
    <AbsoluteFill style={{ color: C.paper, fontFamily: sans, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32 }}>
      <ChapterBars inAt={0} outAt={total} height={42} />

      <div style={{ display: "flex", alignItems: "center", gap: 24, transform: `scale(${logoS})` }}>
        <LogoMark size={88} />
        <div style={{ fontSize: 120, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1 }}>AnveGuard</div>
      </div>

      <RuleDraw at={20} dur={26} width={320} color={C.blue} />

      <div style={{ ...lineIn, fontSize: 44, fontWeight: 400, color: C.paper, textAlign: "center", maxWidth: 1200, letterSpacing: "-0.015em" }}>
        Runtime governance for autonomous AI.
      </div>

      <div style={{ ...subIn, fontFamily: mono, fontSize: 15, color: C.muted, letterSpacing: "0.32em", textTransform: "uppercase" }}>
        inspect · enforce · audit
      </div>

      <div style={{ ...ctaIn, marginTop: 28, padding: "14px 28px", border: `1px solid ${C.hairStrong}`, borderRadius: 8, fontFamily: mono, fontSize: 14, color: C.paper, letterSpacing: "0.24em", textTransform: "uppercase" }}>
        available in private beta
      </div>

      {/* bottom-left attribution */}
      <div style={{ position: "absolute", left: 96, bottom: 64, display: "flex", alignItems: "center", gap: 12, opacity: 0.7 }}>
        <Caption>guard.citerlabs.com</Caption>
      </div>
    </AbsoluteFill>
  );
};
