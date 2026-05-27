# AnveGuard Product Hunt Launch — Storyboard v3

60s, 1920×1080, 30fps. Total: 1800 frames (composition) over 1944 frames of scene content (8 × 18f transition overlaps).

## Three-act arc

| Act | Scenes | Beat |
|---|---|---|
| I Setup | S1–S3 | Normal day. Agent does normal work. Stakes planted. |
| II Crisis | S4–S6 | Attack arrives. Agent obeys. Breach clock ticks. |
| III Resolution | S7–S9 | AnveGuard intercepts. Receipts. Product. |

## Scene table

| # | Title | Frames | Signature MG moment |
|---|---|---|---|
| 1 | Cold Open / Title | 130 | Per-word stagger + signal-blue underline drawn with `strokeDashoffset` |
| 2 | A Day in the Life | 220 | SVG node graph; edges trace; data packets travel along edges |
| 3 | The Blast Radius | 220 | 3 concentric SVG rings pulse outward from agent core |
| 4 | The Trap | 220 | Issue body typewriter; scan-line reveals hidden malicious line in red |
| 5 | The Agent Obeys | 220 | Cascading reasoning lines; SVG arc timer fills 0.0→1.4s |
| 6 | Breach Clock | 200 | 03→02→01 scale-pulse; red rule sweeps screen via clip-path |
| 7 | AnveGuard Intercepts | 260 | Shield SVG draws on; DENIED stamps with spring overshoot |
| 8 | The Receipts | 230 | 4 number tickers easeOutCubic to final values; signed log scrolls |
| 9 | Outro | 244 | Wordmark letter assembly; tagline mask reveal; launch chip |

## Locked tokens

- Palette: ink #0A0E18, paper #EDEFF5, signal #5B8DEF, alert #FF6B6B, ok #3DDC97
- Display: Inter Tight 500/600/700
- Mono: JetBrains Mono 400/500/600
- Default entrance spring `{damping:22, stiffness:180}`
- All scene transitions: 18f scan-wipe in signal blue
