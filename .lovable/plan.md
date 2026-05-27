# AnveGuard — 60s Product Hunt Launch Film v3

A cinematic, motion-graphics-forward 60s product demo in the style of top Product Hunt launch films (Linear, Arc, Raycast, Cron). Rebuilt from scratch with a stronger narrative, real motion-graphics craft (kinetic typography, SVG path tracing, layered parallax, number tickers, shape morphs), and a 4-agent production pipeline.

## Creative Direction

**Aesthetic:** "Linear × Stripe × Vercel" — Tech Product / Cinematic Minimal hybrid. Editorial pacing, infrastructure-grade restraint, with bursts of kinetic energy at hero beats.

**Palette (locked):**
- Ink `#0A0E18` (bg), Panel `#0F1524`, Rule `#1E2A44`
- Paper `#F4F6FB` (primary text)
- Signal `#5B8DEF` (brand accent)
- Alert `#FF6B6B` (threat)
- Success `#3DDC97` (resolved)
- Glow `#7BA8FF` (accent rim only)

**Typography:** Inter Tight (display, weights 500/600/700) + JetBrains Mono (code/labels). Both via `@remotion/google-fonts`.

**Motion system (one rulebook, applied everywhere):**
- Default entrance: 14px rise + opacity, spring `{damping: 22, stiffness: 180}`
- Accent entrance (hero text): clip-path mask reveal left→right, 22f
- Exit: 6px fall + blur-to-0 + opacity, 12f
- Scene transition: 18f signal-blue scan-line wipe (consistent across all 9 scenes)
- Numbers: count-up tickers driven by `interpolate()` with `easeOutCubic`
- Camera: 1.5% slow zoom + 8px parallax drift on every scene (no static frames)

## The Story (improved arc)

The previous 60s cut was a slideshow of features. This version is a **3-act narrative**:

- **Act I — Setup (0–18s):** A normal day. An agent does normal work. Stakes get planted.
- **Act II — Crisis (18–38s):** The attack arrives in plain sight. The agent is about to comply. We *feel* the breach happening in real time.
- **Act III — Resolution (38–60s):** AnveGuard intercepts at every layer. Proof. Product. Promise.

## Storyboard (9 scenes, 1800 frames @ 30fps)

```
ACT I — SETUP
00.0–04.0  S1 Cold Open       120f  Kinetic title: "Your AI agent is a new kind of employee."
04.0–11.0  S2 A Day in the    210f  Animated org-chart of agent + tools + data sources;
              Life of an Agent       SVG paths trace between nodes; "1,184 runs / day"
11.0–18.0  S3 The Blast Radius 210f Map of agent's reach: prod DB, AWS, Slack, GitHub;
                                     concentric blast-radius rings pulse outward.

ACT II — CRISIS
18.0–25.0  S4 The Trap        210f  GitHub issue #482 types in; hidden HTML comment
                                     fades into view; red "indirect injection" pill.
25.0–32.0  S5 The Agent Obeys 210f  Live reasoning typewriter; 3 tool-call lines stream;
                                     timer ticks 0.0s → 1.4s; "247 KB" ticker counts up.
32.0–38.0  S6 The Breach Clock 180f Split screen: countdown 03…02…01; secrets flash;
                                     a red rule sweeps the screen edge-to-edge.

ACT III — RESOLUTION
38.0–46.0  S7 AnveGuard        240f Hero product reveal: shield mark SVG-draws on;
              Intercepts             tool calls morph from red→blue, "DENIED · 403"
                                     stamps in with spring overshoot.
46.0–53.0  S8 The Receipts    210f  Signed audit log scrolls; 4 stat tickers count up
                                     (0 bytes leaked, 12 ms decision, 100% replayable,
                                     247 KB saved).
53.0–60.0  S9 Outro            210f  Wordmark spring-in, tagline mask-reveal,
                                     "Private beta · anveguard.dev" chip,
                                     Product Hunt launch date stamp.
```

Total = 1800f, minus 8 × 18f transitions = effective runtime 59.5s.

## Motion-Graphics Craft (the new stuff)

Each scene gets at least one signature motion-graphics moment:

- **S1:** Per-word stagger on the title with subtle 3D perspective tilt; word "employee" highlights in signal-blue with a swipe underline drawn by `strokeDashoffset`.
- **S2:** SVG node graph where connection paths draw with `strokeDashoffset` animation; small data packets (circles) travel along each path.
- **S3:** 3 concentric SVG rings expand from agent center, each on a delay, fading out as they grow.
- **S4:** Typewriter for the issue body using per-character `interpolate`; the hidden malicious line is masked by a scan-line that reveals it in red.
- **S5:** Reasoning panel uses cascading line reveals; right-side timer is a real SVG arc that fills as the breach clock runs.
- **S6:** Big 03→02→01 countdown with scale-pulse on each tick; horizontal red rule sweeps across with `clipPath`.
- **S7:** Shield logo built from SVG paths that draw on with `strokeDashoffset`; tool-call rows morph color and stamp "DENIED" with spring overshoot.
- **S8:** Number tickers using `interpolate` with `easeOutCubic` — 0→0, 0→12, 0→100, 0→247.
- **S9:** Wordmark assembles letter-by-letter; tagline mask-reveals; subtle particle field drifts in background.

## The Multi-Agent Production Pipeline

I'll run this as 4 explicit agent passes, each visible in the chat output:

1. **Planner Agent** — Locks story arc, scene durations, motion system, palette. Writes `remotion/STORYBOARD.md` so future sessions can iterate.
2. **Storyboard Agent** — Writes a 1-line shot description + key motion-graphics moment for each of the 9 scenes into the same doc. Defines beats.
3. **Scene-Builder Agent** — Builds the 9 scene components, the shared design system (`tokens.ts`, `Type.tsx`, `Backdrop.tsx`, `ScanWipe.tsx`, plus new `NumberTicker.tsx`, `SvgDraw.tsx`, `NodeGraph.tsx`), and wires `MainVideo.tsx`.
4. **QA Agent** — Renders 11 spot-check stills (one per scene + 2 transitions). Reviews each frame for: text overflow, blank frames, dead tails, motion timing, hierarchy. Returns a pass/fail per scene.
5. **Iterator Agent** — Fixes anything QA flagged, re-renders affected ranges, re-checks. Repeats until clean.

Each agent's findings are reported inline in the chat so you can see the process.

## Files

**New:**
- `remotion/STORYBOARD.md` — locked plan + per-scene beats (versioned for future iterations)
- `remotion/src/design/NumberTicker.tsx` — count-up component driven by frame
- `remotion/src/design/SvgDraw.tsx` — path-draw primitive using `strokeDashoffset`
- `remotion/src/design/NodeGraph.tsx` — animated node + edge graph for S2
- `remotion/src/scenes/S1_Title.tsx` — kinetic typography opener
- `remotion/src/scenes/S2_DayInLife.tsx` — agent + tools node graph
- `remotion/src/scenes/S3_BlastRadius.tsx` — concentric pulse rings
- `remotion/src/scenes/S4_Trap.tsx` — GitHub issue typewriter (rebuilt)
- `remotion/src/scenes/S5_Obeys.tsx` — reasoning + breach timer (rebuilt)
- `remotion/src/scenes/S6_Countdown.tsx` — 03·02·01 breach clock
- `remotion/src/scenes/S7_Intercept.tsx` — shield draw + tool-call deny (rebuilt)
- `remotion/src/scenes/S8_Receipts.tsx` — audit log + 4 stat tickers (rebuilt)
- `remotion/src/scenes/S9_Outro.tsx` — wordmark assembly + launch chip (rebuilt)

**Edited:**
- `remotion/src/MainVideo.tsx` — wire new 9-scene `TransitionSeries`
- `remotion/src/Root.tsx` — register `productHunt` composition (1920×1080, 1800f, 30fps); keep prior `main` composition intact for back-compat

## Render & Deliverable

- Render via existing `scripts/render-remotion.mjs` with `COMPOSITION=productHunt`
- Output: `/mnt/documents/anveguard-producthunt-60s.mp4`
- Expected size ~6 MB, render ~3–4 min at concurrency=1

## Out of Scope (follow-ups after approval)

- Audio bed / voiceover
- 9:16 vertical cut
- 10s teaser cut
- Embedding on `/simulation` page
- Any changes to the live web app

## Technical Notes

- All animation via `useCurrentFrame()` + `interpolate()` / `spring()` (no CSS animations)
- All scenes use `AbsoluteFill` root; shared `Backdrop` outside the `TransitionSeries` for persistent parallax grid
- Composition duration capped at 1800f to avoid the dead-tail bug from v2
- Outro fade window aligned to scene end so the last frame is the wordmark, not black
- Spot-check stills via `ffmpeg -ss` extraction from a low-concurrency draft render (CLI `remotion still` doesn't work in this sandbox — bundled chrome-headless-shell is missing libnspr4)