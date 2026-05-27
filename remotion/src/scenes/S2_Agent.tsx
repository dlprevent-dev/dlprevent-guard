import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C, FONTS, SPRING } from "../design/tokens";
import { Mono, useEnter } from "../design/Type";

const ToolRow: React.FC<{ name: string; trusted: boolean; delay: number }> = ({ name, trusted, delay }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: SPRING.enter });
  return (
    <div style={{
      opacity: s,
      transform: `translateX(${interpolate(s, [0, 1], [-16, 0])}px)`,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "14px 20px",
      borderBottom: `1px solid ${C.rule}`,
      fontFamily: FONTS.mono,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: trusted ? C.ok : C.signal }} />
        <span style={{ fontSize: 18, color: C.paper }}>{name}</span>
      </div>
      <span style={{ fontSize: 13, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>
        {trusted ? "trusted" : "exposed"}
      </span>
    </div>
  );
};

export const S2_Agent: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "80px 120px" }}>
      <Mono size={16} color={C.muted}>chapter 01 · the agent</Mono>
      <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -1.6, marginTop: 14, lineHeight: 1.05, ...useEnter(6) }}>
        Meet <span style={{ color: C.signal }}>prod-agent-7</span>.
      </div>
      <div style={{ marginTop: 18, fontSize: 26, color: C.muted, maxWidth: 1100, ...useEnter(20) }}>
        An LLM agent in production. Reads GitHub issues. Writes code. Calls 7 tools across your infrastructure.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, marginTop: 56, alignItems: "start" }}>
        {/* identity card */}
        <div style={{
          background: C.panel,
          border: `1px solid ${C.rule}`,
          borderRadius: 14,
          padding: 28,
          ...useEnter(34),
        }}>
          <Mono size={13} color={C.muted}>identity</Mono>
          <div style={{ marginTop: 14, fontFamily: FONTS.mono, fontSize: 28, color: C.paper }}>
            agent://prod-agent-7
          </div>
          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 10, columnGap: 24, fontFamily: FONTS.mono, fontSize: 15 }}>
            <span style={{ color: C.muted }}>model</span><span style={{ color: C.paper }}>gpt-5.5-pro</span>
            <span style={{ color: C.muted }}>region</span><span style={{ color: C.paper }}>us-east-1</span>
            <span style={{ color: C.muted }}>uptime</span><span style={{ color: C.paper }}>342h</span>
            <span style={{ color: C.muted }}>runs/day</span><span style={{ color: C.paper }}>1,184</span>
          </div>
          <div style={{ marginTop: 26, padding: "14px 18px", borderRadius: 10, border: `1px solid ${C.ruleSoft}`, background: "rgba(91,141,239,0.05)" }}>
            <Mono size={12} color={C.muted}>mission</Mono>
            <div style={{ marginTop: 6, fontSize: 19, color: C.paper, lineHeight: 1.45 }}>
              Triage open GitHub issues in <span style={{ color: C.signal }}>acme/backend</span> every 5 minutes.
            </div>
          </div>
        </div>

        {/* tools panel */}
        <div style={{
          background: C.panel,
          border: `1px solid ${C.rule}`,
          borderRadius: 14,
          padding: 0,
          overflow: "hidden",
          ...useEnter(48),
        }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between" }}>
            <Mono size={13} color={C.muted}>tool access</Mono>
            <Mono size={13} color={C.muted}>7 enabled</Mono>
          </div>
          <ToolRow name="github.issues.list"  trusted={true}  delay={62} />
          <ToolRow name="github.issues.get"   trusted={false} delay={70} />
          <ToolRow name="github.pr.create"    trusted={true}  delay={78} />
          <ToolRow name="fs.read"             trusted={false} delay={86} />
          <ToolRow name="http.post"           trusted={false} delay={94} />
          <ToolRow name="shell.exec"          trusted={false} delay={102} />
          <ToolRow name="slack.notify"        trusted={true}  delay={110} />
        </div>
      </div>

      {/* bottom warning */}
      <div style={{
        position: "absolute", left: 120, bottom: 60,
        opacity: interpolate(f, [130, 160], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.alert, boxShadow: `0 0 12px ${C.alert}` }} />
        <span style={{ fontFamily: FONTS.mono, fontSize: 15, color: C.alert, letterSpacing: 2, textTransform: "uppercase" }}>
          4 of 7 tools touch untrusted input
        </span>
      </div>
    </AbsoluteFill>
  );
};
