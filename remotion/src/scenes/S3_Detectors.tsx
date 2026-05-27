import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, FONTS, SPRING } from "../design/tokens";
import { Mono, useEnter, useAccent } from "../design/Type";

const DetectorRow: React.FC<{ name: string; conf: number; delay: number; spark: number[] }> = ({ name, conf, delay, spark }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: SPRING.enter });
  const bar = interpolate(s, [0, 1], [0, conf]);
  const opacity = s;
  const max = Math.max(...spark);
  return (
    <div style={{ opacity, transform: `translateY(${interpolate(s, [0, 1], [12, 0])}px)`, padding: "18px 0", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: C.alert, boxShadow: `0 0 10px ${C.alert}` }} />
          <div style={{ fontFamily: FONTS.sans, fontSize: 22, color: C.paper, fontWeight: 500 }}>{name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width={120} height={28} viewBox={`0 0 ${spark.length - 1} 10`} preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke={C.signal}
              strokeWidth={0.4}
              points={spark.map((v, i) => `${i},${10 - (v / max) * 9}`).join(" ")}
            />
          </svg>
          <div style={{ fontFamily: FONTS.mono, fontSize: 18, color: C.paper, width: 70, textAlign: "right" }}>
            {(bar * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div style={{ height: 2, background: C.rule, marginTop: 10, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: `${bar * 100}%`, background: `linear-gradient(90deg, ${C.signal}, ${C.alert})` }} />
      </div>
    </div>
  );
};

const Gauge: React.FC<{ value: number; delay: number }> = ({ value, delay }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 14, stiffness: 90 } });
  const v = interpolate(s, [0, 1], [0, value]);
  const angle = interpolate(v, [0, 1], [-90, 90]); // semicircle
  const cx = 200, cy = 200, r = 160;
  const arc = (start: number, end: number) => {
    const sa = (start - 90) * Math.PI / 180;
    const ea = (end - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
    const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
    const large = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  return (
    <svg width={400} height={240} viewBox="0 0 400 240">
      <path d={arc(0, 180)} stroke={C.rule} strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={arc(0, 180 * v)} stroke={v > 0.7 ? C.alert : C.signal} strokeWidth={10} fill="none" strokeLinecap="round" />
      {/* needle */}
      <g transform={`rotate(${angle} ${cx} ${cy})`}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 18} stroke={C.paper} strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={8} fill={C.paper} />
      </g>
    </svg>
  );
};

export const S3_Detectors: React.FC = () => {
  const score = useAccent(80);
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.sans, color: C.paper, padding: "80px 120px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, alignItems: "start" }}>
      <div>
        <Mono size={16} color={C.muted}>step 02 · threat intelligence</Mono>
        <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: -1.2, marginTop: 14, lineHeight: 1.05, ...useEnter(6) }}>
          Four detectors fire<br />in <span style={{ color: C.signal }}>12ms</span>.
        </div>
        <div style={{ marginTop: 36 }}>
          <DetectorRow name="Prompt Injection" conf={0.97} delay={26} spark={[1,2,1,3,2,4,5,7,8,9]} />
          <DetectorRow name="Data Exfiltration" conf={0.91} delay={40} spark={[1,1,2,2,3,4,6,7,8,9]} />
          <DetectorRow name="Tool Abuse" conf={0.88} delay={54} spark={[2,2,3,3,4,5,5,6,8,9]} />
          <DetectorRow name="Policy Drift" conf={0.74} delay={68} spark={[1,1,1,2,3,3,4,5,6,7]} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 60 }}>
        <Mono size={14} color={C.muted}>threat score</Mono>
        <div style={{ marginTop: 24, ...useEnter(20) }}>
          <Gauge value={0.94} delay={36} />
        </div>
        <div style={{ marginTop: -10, fontFamily: FONTS.mono, fontSize: 96, color: C.paper, fontWeight: 600, letterSpacing: -2, ...score }}>
          0.94
        </div>
        <div style={{ marginTop: 6, fontFamily: FONTS.mono, fontSize: 18, color: C.alert, letterSpacing: 3, ...score }}>
          CRITICAL
        </div>
      </div>
    </AbsoluteFill>
  );
};
