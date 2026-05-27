import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { sans, mono, useEntrance, RuleDraw, StatusStrip, LogoMark, ChapterBars, easeOut } from "../design/primitives";
import { C, TYPE } from "../design/tokens";

export const S1Hook: React.FC<{ total: number }> = ({ total }) => {
  const f = useCurrentFrame();
  const cold = interpolate(f, [0, 14, 32, 42], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const titleIn = useEntrance(36, 26);
  const subIn = useEntrance(54, 22);
  const statusIn = useEntrance(48, 22);

  // breathing zoom
  const zoom = 1 + interpolate(f, [0, total], [0, 0.012]);

  return (
    <AbsoluteFill style={{ color: C.paper, fontFamily: sans, transform: `scale(${zoom})` }}>
      <ChapterBars inAt={0} outAt={total} height={42} />

      {/* cold-open timecode */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: cold, fontFamily: mono, fontSize: 18, color: C.muted, letterSpacing: "0.32em" }}>
        INCIDENT · EVT_A91F · 03:42:18Z
      </div>

      {/* main title block */}
      <div style={{ position: "absolute", left: 96, right: 96, top: "34%", ...titleIn }}>
        <div style={{ fontFamily: mono, fontSize: 14, color: C.blue, letterSpacing: "0.32em", marginBottom: 28 }}>
          ANVEGUARD · DISPATCH 001
        </div>
        <div style={{ fontSize: TYPE.display.size, fontWeight: TYPE.display.weight, letterSpacing: TYPE.display.tracking, lineHeight: TYPE.display.line, color: C.paper }}>
          Your AI agent
        </div>
        <div style={{ fontSize: TYPE.display.size, fontWeight: TYPE.display.weight, letterSpacing: TYPE.display.tracking, lineHeight: TYPE.display.line, color: C.paper }}>
          just got <span style={{ color: C.alert }}>hacked</span>.
        </div>
        <RuleDraw at={58} dur={28} width={520} color={C.blue} style={{ marginTop: 36 }} />
        <div style={{ marginTop: 28, fontSize: 26, color: C.muted, maxWidth: 940, lineHeight: 1.45, ...subIn }}>
          A real incident, frame by frame — and the control layer that contained it.
        </div>
      </div>

      {/* bottom-left status strip */}
      <div style={{ position: "absolute", left: 96, bottom: 56, ...statusIn }}>
        <StatusStrip items={[
          { k: "agent", v: "agent_42 · prod", tone: C.paper },
          { k: "region", v: "sfo-3", tone: C.paper },
          { k: "policy", v: "prod-default-v4", tone: C.paper },
          { k: "status", v: "● live", tone: C.alert },
        ]} />
      </div>

      {/* top-right wordmark */}
      <div style={{ position: "absolute", right: 96, top: 60, display: "flex", alignItems: "center", gap: 12, opacity: 0.85 }}>
        <LogoMark size={24} />
        <span style={{ fontFamily: mono, fontSize: 13, color: C.muted, letterSpacing: "0.32em" }}>ANVEGUARD</span>
      </div>
    </AbsoluteFill>
  );
};
