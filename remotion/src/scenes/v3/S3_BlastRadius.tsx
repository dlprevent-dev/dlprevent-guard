import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import { C, FONTS } from "../../design/tokens";
import { Mono, useEnter } from "../../design/Type";

const REACH = [
  { label: "production database", angle: -60, radius: 280 },
  { label: "aws iam · admin",     angle: 30,  radius: 320 },
  { label: "stripe · live keys",  angle: 120, radius: 290 },
  { label: "slack #engineering",  angle: 200, radius: 260 },
  { label: "github · write",      angle: -130, radius: 310 },
];

const Ring: React.FC<{ delay: number; max: number }> = ({ delay, max }) => {
  const f = useCurrentFrame();
  const cycle = ((f - delay) % 80) / 80;
  if (f < delay) return null;
  const r = cycle * max;
  const op = interpolate(cycle, [0, 0.1, 1], [0, 0.5, 0], { easing: Easing.out(Easing.quad) });
  return (
    <circle cx={960} cy={540} r={r} fill="none" stroke={C.alert} strokeWidth={1.5} opacity={op} />
  );
};

export const S3_BlastRadius: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "60px 120px" }}>
      <Mono size={14} color={C.muted}>act i · scene 03</Mono>
      <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: -1.2, marginTop: 10, ...useEnter(4) }}>
        Its blast radius is <span style={{ color: C.alert }}>everything you own.</span>
      </div>

      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {/* pulse rings */}
        <Ring delay={40} max={420} />
        <Ring delay={70} max={420} />
        <Ring delay={100} max={420} />
        <Ring delay={130} max={520} />
        <Ring delay={155} max={900} />

        {/* center agent */}
        <g>
          <circle cx={960} cy={540} r={48} fill="none" stroke={C.signalSoft} strokeWidth={1} />
          <circle cx={960} cy={540} r={28} fill={C.signal}
            style={{ filter: `drop-shadow(0 0 20px ${C.signal})` }} />
          <text x={960} y={620} textAnchor="middle" fontFamily={FONTS.mono} fontSize={14} fill={C.muted}>
            agent
          </text>
        </g>

        {/* reach labels */}
        {REACH.map((r, i) => {
          const x = 960 + Math.cos(r.angle * Math.PI / 180) * r.radius;
          const y = 540 + Math.sin(r.angle * Math.PI / 180) * r.radius;
          const appear = interpolate(f, [30 + i * 12, 50 + i * 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <g key={i} opacity={appear}>
              <circle cx={x} cy={y} r={4} fill={C.alert} />
              <line x1={960} y1={540} x2={x} y2={y} stroke={C.rule} strokeWidth={0.8} opacity={0.6} />
              <text x={x} y={y - 14} textAnchor="middle" fontFamily={FONTS.mono} fontSize={15} fill={C.paper} letterSpacing="0.5">
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{
        position: "absolute", left: 120, bottom: 60,
        opacity: interpolate(f, [150, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.alert, boxShadow: `0 0 12px ${C.alert}` }} />
        <span style={{ fontFamily: FONTS.mono, fontSize: 15, color: C.alert, letterSpacing: 2, textTransform: "uppercase" }}>
          one bad prompt = total compromise
        </span>
      </div>
    </AbsoluteFill>
  );
};
