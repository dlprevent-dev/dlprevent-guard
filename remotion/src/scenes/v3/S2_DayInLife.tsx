import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, FONTS } from "../../design/tokens";
import { Mono, useEnter } from "../../design/Type";
import { SvgPathDraw } from "../../design/SvgDraw";
import { NumberTicker } from "../../design/NumberTicker";

const NODES = [
  { id: "agent",  x: 960, y: 540, label: "prod-agent-7", kind: "core" },
  { id: "gh",     x: 480, y: 280, label: "github.issues" },
  { id: "db",     x: 1440, y: 280, label: "postgres.prod" },
  { id: "fs",     x: 360, y: 760, label: "fs.read" },
  { id: "http",   x: 960, y: 880, label: "http.post" },
  { id: "slack",  x: 1560, y: 760, label: "slack.notify" },
];

const Packet: React.FC<{ from: typeof NODES[0]; to: typeof NODES[0]; delay: number }> = ({ from, to, delay }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [delay, delay + 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cycle = ((f - delay) % 80) / 80;
  if (f < delay + 30) return null;
  const x = from.x + (to.x - from.x) * cycle;
  const y = from.y + (to.y - from.y) * cycle;
  return (
    <circle cx={x} cy={y} r={5} fill={C.signal} style={{ filter: `drop-shadow(0 0 6px ${C.signal})`, opacity: p }} />
  );
};

export const S2_DayInLife: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "60px 120px" }}>
      <Mono size={14} color={C.muted}>act i · scene 02</Mono>
      <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: -1.2, marginTop: 10, ...useEnter(4) }}>
        A day in the life of an agent.
      </div>

      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        {/* edges */}
        {NODES.slice(1).map((n, i) => (
          <SvgPathDraw
            key={n.id}
            d={`M ${NODES[0].x} ${NODES[0].y} L ${n.x} ${n.y}`}
            stroke={C.rule}
            strokeWidth={1.5}
            start={20 + i * 8}
            duration={26}
          />
        ))}
        {/* packets */}
        {NODES.slice(1).map((n, i) => (
          <Packet key={`p-${n.id}`} from={NODES[0]} to={n} delay={80 + i * 10} />
        ))}
        {/* nodes */}
        {NODES.map((n, i) => {
          const r = n.kind === "core" ? 26 : 12;
          const appear = interpolate(f, [10 + i * 5, 28 + i * 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <g key={n.id} style={{ opacity: appear }}>
              {n.kind === "core" && (
                <circle cx={n.x} cy={n.y} r={r + 14} fill="none" stroke={C.signalSoft} strokeWidth={1} />
              )}
              <circle cx={n.x} cy={n.y} r={r} fill={n.kind === "core" ? C.signal : C.panel} stroke={n.kind === "core" ? C.signal : C.rule} strokeWidth={1.5}
                style={n.kind === "core" ? { filter: `drop-shadow(0 0 16px ${C.signal})` } : undefined} />
              <text x={n.x} y={n.y + r + 22} textAnchor="middle"
                fontFamily={FONTS.mono} fontSize={16} fill={C.muted} style={{ letterSpacing: 0.6 }}>
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* stat strip bottom */}
      <div style={{
        position: "absolute", left: 120, bottom: 60, display: "flex", gap: 80, alignItems: "baseline",
        opacity: interpolate(f, [120, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <div>
          <Mono size={12} color={C.muted}>runs / day</Mono>
          <div style={{ marginTop: 4 }}>
            <NumberTicker to={1184} start={130} duration={50} size={44} />
          </div>
        </div>
        <div>
          <Mono size={12} color={C.muted}>tools called</Mono>
          <div style={{ marginTop: 4 }}>
            <NumberTicker to={7} start={130} duration={50} size={44} />
          </div>
        </div>
        <div>
          <Mono size={12} color={C.muted}>uptime</Mono>
          <div style={{ marginTop: 4, fontFamily: FONTS.sans, fontSize: 44, fontWeight: 600, color: C.paper, letterSpacing: -1 }}>
            <NumberTicker to={342} start={130} duration={50} size={44} suffix="h" />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
