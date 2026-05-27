import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { sans, mono, useEntrance, Panel, Caption, easeOut } from "../design/primitives";
import { C } from "../design/tokens";

export const S3Detect: React.FC<{ total: number }> = ({ total }) => {
  const { fps } = useVideoConfig();
  const f = useCurrentFrame();
  const heroIn = useEntrance(8, 28);
  const satellites = [
    { name: "injection.heuristic", t: 38, v: "0.97" },
    { name: "tool.intent.classifier", t: 52, v: "exfil" },
    { name: "egress.url.allowlist", t: 66, v: "deny" },
    { name: "secrets.path.guard", t: 80, v: "match" },
  ];

  const score = Math.round(interpolate(f, [30, 110], [0, 92], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut }));
  const needleAngle = interpolate(score, [0, 100], [-90, 90]);
  const color = score > 70 ? C.alert : score > 40 ? C.amber : C.ok;

  return (
    <AbsoluteFill style={{ color: C.paper, fontFamily: sans, padding: 96 }}>
      <div style={{ position: "absolute", left: 96, bottom: 56 }}>
        <Caption>step 02 / 04 · policy pipeline · prod-default-v4</Caption>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center", height: "100%" }}>
        {/* HERO: primary detector */}
        <div style={heroIn}>
          <Caption tone={C.blue}>primary signal</Caption>
          <div style={{ marginTop: 16, fontSize: 64, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05, color: C.paper }}>
            risk-trio<br /><span style={{ color: C.alert }}>composer match</span>
          </div>
          <div style={{ marginTop: 22, fontSize: 20, color: C.muted, lineHeight: 1.55, maxWidth: 520 }}>
            Untrusted input <span style={{ color: C.paper }}>×</span> outbound channel <span style={{ color: C.paper }}>×</span> privileged context. The three signals that turn a prompt into a breach.
          </div>

          {/* satellite detectors */}
          <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 }}>
            {satellites.map((d) => {
              const a = interpolate(f - d.t, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
              if (a === 0) return null;
              return (
                <div key={d.name} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 0",
                  borderTop: `1px solid ${C.hair}`,
                  opacity: a, transform: `translateY(${interpolate(a, [0, 1], [6, 0])}px)`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: C.alert }} />
                    <span style={{ fontFamily: mono, fontSize: 15, color: C.paper, letterSpacing: "0.04em" }}>{d.name}</span>
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 13, color: C.alert, letterSpacing: "0.18em", textTransform: "uppercase" }}>{d.v}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* THREAT GAUGE */}
        <Panel style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", aspectRatio: "1" }}>
          <Caption>threat score</Caption>
          <div style={{ position: "relative", width: 360, height: 220, marginTop: 18 }}>
            <svg width={360} height={220} viewBox="0 0 360 220">
              <path d="M 30 200 A 150 150 0 0 1 330 200" stroke={C.hair} strokeWidth={2} fill="none" />
              <path d="M 30 200 A 150 150 0 0 1 330 200" stroke={color} strokeWidth={2.5} fill="none"
                strokeDasharray={Math.PI * 150}
                strokeDashoffset={Math.PI * 150 * (1 - score / 100)}
                style={{ filter: `drop-shadow(0 0 8px ${color}90)` }}
              />
              {/* ticks */}
              {Array.from({ length: 11 }).map((_, i) => {
                const a = (i / 10) * Math.PI;
                const x1 = 180 - Math.cos(a) * 160;
                const y1 = 200 - Math.sin(a) * 160;
                const x2 = 180 - Math.cos(a) * 170;
                const y2 = 200 - Math.sin(a) * 170;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.hairStrong} strokeWidth={1} />;
              })}
              {/* needle */}
              <g transform={`translate(180,200) rotate(${needleAngle})`}>
                <line x1={0} y1={0} x2={0} y2={-140} stroke={color} strokeWidth={1.5} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                <circle cx={0} cy={0} r={4} fill={color} />
              </g>
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 6 }}>
              <div style={{ fontFamily: mono, fontSize: 84, fontWeight: 500, color: C.paper, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" }}>{score}</div>
              <div style={{ fontFamily: mono, fontSize: 12, color: C.muted, letterSpacing: "0.32em" }}>/ 100</div>
            </div>
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 24, fontFamily: mono, fontSize: 12, color: C.muted, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            <span style={{ color: C.ok }}>0–40 ok</span>
            <span style={{ color: C.amber }}>40–70 warn</span>
            <span style={{ color: C.alert }}>70+ block</span>
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
};
