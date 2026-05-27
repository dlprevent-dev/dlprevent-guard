import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig, spring } from "remotion";
import { sans, mono, useEntrance, Panel, Caption, easeOut } from "../design/primitives";
import { C } from "../design/tokens";

export const S5Audit: React.FC<{ total: number }> = ({ total }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = [
    { t: 0, tone: "system", text: "anveguard.intercept evt_a91f" },
    { t: 8, tone: "warn", text: "policy.match injection.heuristic conf=0.97" },
    { t: 16, tone: "warn", text: "policy.match secrets.path.guard ~/.env" },
    { t: 24, tone: "warn", text: "policy.match egress.allowlist attacker.tld" },
    { t: 32, tone: "warn", text: "policy.match risk.trio.composer" },
    { t: 40, tone: "deny", text: "tool.fs.read           → DENIED 403" },
    { t: 48, tone: "deny", text: "tool.http.post         → DENIED 403" },
    { t: 56, tone: "deny", text: "tool.shell.exec        → DENIED 403" },
    { t: 66, tone: "ok",   text: "outbound.bytes         = 0" },
    { t: 74, tone: "ok",   text: "secrets.exposed        = 0" },
    { t: 82, tone: "ok",   text: "audit.signed           = sha256:9f1c…a23b" },
    { t: 92, tone: "ok",   text: "incident.closed        status=contained" },
  ];
  const toneColor: Record<string, string> = { system: C.muted, warn: C.amber, deny: C.alert, ok: C.ok };

  // bytes counter: 247KB climbing then crash to 0
  const climb = interpolate(f, [40, 80], [0, 247000], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const crash = interpolate(f, [80, 92], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const bytesShown = Math.round(climb * crash);
  const finalIn = useEntrance(96, 24);
  const finalScale = spring({ frame: f - 96, fps, config: { damping: 16, stiffness: 110 } });

  const stats = [
    { k: "secrets exposed", v: "0",       tone: C.ok },
    { k: "outbound bytes",  v: bytesShown.toLocaleString(), tone: bytesShown > 0 ? C.amber : C.ok },
    { k: "calls blocked",   v: "3",       tone: C.alert },
    { k: "time to contain", v: "180 ms",  tone: C.paper },
  ];

  return (
    <AbsoluteFill style={{ color: C.paper, fontFamily: sans, padding: 96 }}>
      <div style={{ position: "absolute", left: 96, bottom: 56 }}>
        <Caption>step 04 / 04 · immutable audit · containment report</Caption>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 56, marginTop: 40, alignItems: "stretch" }}>
        {/* AUDIT TERMINAL */}
        <Panel style={{ padding: 0, fontFamily: mono, fontSize: 16, lineHeight: 1.7, overflow: "hidden" }}>
          <div style={{ padding: "14px 22px", borderBottom: `1px solid ${C.hair}`, display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.015)" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: C.alert }} />
              <span style={{ width: 8, height: 8, borderRadius: 999, background: C.amber }} />
              <span style={{ width: 8, height: 8, borderRadius: 999, background: C.ok }} />
            </div>
            <span style={{ color: C.muted, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase" }}>audit.log · evt_a91f</span>
          </div>
          <div style={{ padding: "22px 26px" }}>
            {lines.map((l, i) => {
              const a = interpolate(f - l.t, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
              if (a === 0) return null;
              return (
                <div key={i} style={{ opacity: a, transform: `translateY(${interpolate(a, [0, 1], [4, 0])}px)`, display: "flex", gap: 14 }}>
                  <span style={{ color: C.mutedDim, width: 28, textAlign: "right" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ color: toneColor[l.tone], letterSpacing: "0.02em" }}>{l.text}</span>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 14 }}>
              <span style={{ color: C.mutedDim, width: 28, textAlign: "right" }}>{String(lines.length + 1).padStart(2, "0")}</span>
              <span style={{ display: "inline-block", width: 9, height: 17, background: C.blue, opacity: (Math.floor(f / 12) % 2) }} />
            </div>
          </div>
        </Panel>

        {/* OUTCOME */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 28, opacity: finalIn.opacity, transform: `translateY(${interpolate(finalScale, [0, 1], [16, 0])}px)` }}>
          <Caption tone={C.ok}>outcome · contained</Caption>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <div style={{ fontSize: 168, fontWeight: 600, lineHeight: 0.9, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", color: C.paper }}>0</div>
            <div style={{ fontSize: 28, color: C.muted, letterSpacing: "-0.01em" }}>bytes exfiltrated</div>
          </div>
          <div style={{ fontSize: 24, color: C.muted, lineHeight: 1.45, maxWidth: 460 }}>
            Counterfactual: <span style={{ color: C.amber }}>247 KB</span> of secrets would have left the boundary.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
            {stats.map((s) => (
              <Panel key={s.k} style={{ padding: "18px 20px" }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, letterSpacing: "0.18em", textTransform: "uppercase" }}>{s.k}</div>
                <div style={{ marginTop: 8, fontFamily: mono, fontSize: 28, color: s.tone, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{s.v}</div>
              </Panel>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
