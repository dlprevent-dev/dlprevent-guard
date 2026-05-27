# AnveGuard Simulation Film — v2 (Pro Cut)

Goal: take the current 26s render from "good demo" to a piece that could ship on a Google Cloud / Stripe / Linear product page. Same story beats, dramatically higher craft.

## Direction (locked)

- **Aesthetic**: editorial infra-grade. Calm authority, not cyberpunk. Think Stripe Sessions × Linear launch × Apple keynote chapter card.
- **Palette refinement**: deepen background to a graded near-black (`#05070C → #0B1020` vignette), demote pure red. Use a tighter 4-color system: ink `#0A0E18`, paper `#EDEFF5`, signal blue `#5B8DEF`, alert `#FF6B6B` (used sparingly, never as fill), success `#3DDC97`. No glowing neons.
- **Type**: keep Inter + JetBrains Mono, but enforce a real type scale (display 168 → h1 96 → h2 56 → body 22 → mono 18/14). Tighten tracking on display (-0.02em), open tracking on mono labels (+0.18em). One weight per role.
- **Motion language**: one entrance (mask-reveal up + 8px settle), one exit (blur + fade), one accent (spring scale on stamps/numbers). Kill the generic spring-on-everything feel.

## Cinematography upgrades

1. **Cold open (0:00–0:03)** — black frame, single mono line types in: `incident · evt_a91f · 03:42:18Z`. Cut to title with a horizontal wipe driven by a thin signal-blue rule. No "live attack" pill on screen 1 — too busy.
2. **Title typography** — switch the two-line headline to a single, tighter composition with a hairline rule and a small caption. Less shouty, more headline-of-record.
3. **Camera work** — subtle parallax: backdrop drifts -8px while foreground settles 0. Add a 1.5% zoom across every static scene so nothing feels frozen.
4. **Scene transitions** — replace hard `Series` cuts with `TransitionSeries` using a custom mask wipe (clip-path) that follows a blue scanning line. Reuse the same wipe everywhere → ritual.
5. **Pacing rebalance** — current cut is front-heavy. New beats: 2.5s / 4s / 4.5s / 5s / 6s / 4s = 26s, with held endings before each cut (250ms breathing room).
6. **Letterbox bars** — animate thin 24px bars in/out at the title and outro only. Signals "chapter."

## Scene-by-scene polish

- **S1 Hook**: remove inline pill, move "live attack" badge to a bottom-left status strip with timestamp + region + agent id (`sfo-3 · agent_42`). Headline becomes `Your AI agent / just got hacked.` with a thin blue rule under it that draws in.
- **S2 Injection**: redesign the GitHub issue card as a *real* GitHub UI clone (avatar, label chips, comment metadata). The hidden HTML comment doesn't just fade red — it gets *highlighted* by a horizontal scanner line, then a callout annotation flies out: `→ untrusted content`.
- **S3 Detectors**: replace 5 identical rows with a hierarchy — primary detector (risk-trio) is large and centered, the other 4 are smaller satellites. Threat gauge becomes a thinner arc with an animated needle and a sparkline of the score climbing. Add a tiny "policy: prod-default-v4" tag.
- **S4 Block**: stamps are too on-the-nose. Replace `BLOCKED` rubber stamps with a clean `DENIED · 403` row treatment (Stripe-style log line) plus a left-edge red rule that fills in as each is blocked. Add a running counter top-right: `blocked: 1 → 2 → 3`.
- **S5 Audit**: split-screen becomes asymmetric (60/40). Left audit terminal gets a real cursor and line numbers. Right side: the "0 bytes" number counts up *from 247KB then crashes back to 0* (visual punchline showing what would have leaked). Add four stat tiles instead of inline rows.
- **S6 Outro**: drop the URL, add a single line of copy: `Available now in private beta.` with a hairline CTA-style frame around the wordmark. Final frame holds for 18 frames on pure brand.

## New technical additions

- **Background audio (muted track stays muted in render, but exported separately)**: out of scope for this pass — sandbox ffmpeg can't encode AAC reliably. Will deliver silent master.
- **Captions / lower-thirds**: small mono captions in bottom-left throughout (`step 01 / 04 · prompt received`), Apple-keynote style. Replaces the giant `STEP 02` labels.
- **Frame counter / timecode HUD**: optional tiny `00:12 / 00:26` in top-right corner, off by default but easy to toggle.
- **Export variants**: same source renders three deliverables —
  1. `anveguard-simulation-v2.mp4` — 1920×1080, 30fps master
  2. `anveguard-simulation-v2-vertical.mp4` — 1080×1920 social cut (re-laid out, not just cropped)
  3. `anveguard-simulation-v2-teaser.mp4` — 10s cut (scenes 1 + 4 + 6)

## Files

- Refactor `remotion/src/MainVideo.tsx` into per-scene files under `remotion/src/scenes/` (S1Hook, S2Injection, S3Detect, S4Block, S5Audit, S6Outro) + shared `remotion/src/design/` (tokens, primitives, transitions).
- Add `remotion/src/compositions/Vertical.tsx` and `Teaser.tsx` registered alongside `main`.
- Update `Root.tsx` with three `<Composition>` entries.
- Render script gets a `COMPOSITION` env var so I can render all three to `/mnt/documents/`.

## Out of scope

- No audio/voiceover (sandbox limitation).
- No real LLM, no real GitHub API.
- No embedding in `/simulation` page (that's a follow-up if you want).

---

Ship this and you get a 26s master + 1 vertical + 1 teaser, all rendered to `/mnt/documents/` and ready to drop on a launch page, X, or LinkedIn. Want me to proceed with all three variants, or just the 16:9 master first?
