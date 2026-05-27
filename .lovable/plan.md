# AnveGuard Product Hunt Video — v4 "Awwwards" Pass

v3 is solid but reads like a polished explainer. v4 is the version that *wins Product Hunt #1*: a 60s film with a real cold-open, a villain, a hero, and receipts — paced like a trailer, sound-designed like an Apple keynote.

## What's actually wrong with v3 (the honest list)

1. **Cold open is weak.** Title fades in over a quiet bed. No hook. PH viewers scroll in 1.5s.
2. **VO is competent but flat.** Brian on default settings = "podcast ad voice." Needs more dynamic range, urgency in act II, calm authority in act III.
3. **Motion peaks too early.** S3 blast radius is the biggest visual — but then S4/S5/S6 don't escalate. By S7 the eye is tired.
4. **Sound design is layered but undifferentiated.** Music bed + SFX don't *punctuate* the visual hits. Heartbeat and ticks compete instead of trading.
5. **No silence.** Every frame has music. The best trailers cut to silence right before the drop. We need 2 deliberate silent beats.
6. **Receipts scene is busy.** Terminal + 4 stat tiles + headline = eye doesn't know where to land.
7. **Outro is a logo + tagline.** No memorable last frame. Needs a sting.
8. **No real product UI shown.** Viewers don't know what AnveGuard *looks like*. One quick dashboard glimpse in S8 would 10x credibility.

## v4 plan

### 1. New 9-beat narrative (rewritten, 138 words)

| # | Time  | Beat                | VO                                                                                            |
|---|-------|---------------------|-----------------------------------------------------------------------------------------------|
| 1 | 0–5   | Cold open (silent)  | *(2s of silence + glitch SFX, then:)* "Your AI agent has the keys to everything you own."     |
| 2 | 5–12  | Day in life         | "Every day, it reads your repos, your inbox, your secrets — thousands of times."              |
| 3 | 12–18 | Blast radius        | "One prompt. The blast radius of your entire company."                                        |
| 4 | 18–25 | The trap            | "Then someone hides one line… in a GitHub issue."                                             |
| 5 | 25–32 | Agent obeys         | "And your agent obeys. In 1.4 seconds, it's already moving your data."                        |
| 6 | 32–38 | Breach clock        | "Three. Two. One. — *(silence)* — breach."                                                    |
| 7 | 38–48 | AnveGuard intercepts| "AnveGuard sits in front of every prompt, every tool call, every response. 12 milliseconds. Denied." |
| 8 | 48–55 | Receipts + product  | "Zero bytes leaked. 247 kilobytes saved. Signed. Replayable. Done."                           |
| 9 | 55–60 | Outro sting         | "AnveGuard. The runtime firewall for AI agents." *(beat)* "Hunt us today."                    |

**VO direction per scene** (passed to ElevenLabs via `voice_settings` per-scene):
- S1: stability 0.35, style 0.55 — slow, ominous, almost a whisper at the start
- S2–S3: stability 0.5, style 0.4 — informational
- S4: stability 0.3, style 0.6 — conspiratorial, drop in pitch on "one line"
- S5–S6: stability 0.4, style 0.5 — urgent, accelerating
- S7: stability 0.55, style 0.3 — calm authority, hero voice
- S8: stability 0.6, style 0.25 — matter-of-fact, confident
- S9: stability 0.5, style 0.45 — brand voice, slight smile on "Hunt us today"

Use **request stitching** (`previous_text`/`next_text`) across all 9 calls for natural prosody.

### 2. Motion escalation (the real fix)

The whole video needs an **energy curve**: low → medium → HIGH → silence → MEDIUM → high → resolved.

| Scene | v3 issue                          | v4 fix                                                                                                 |
|-------|-----------------------------------|--------------------------------------------------------------------------------------------------------|
| S1    | Title fades in, boring            | **Hard cut from black.** Single glitch frame. Title types in mono-glyph by mono-glyph with a cursor. Subtle CRT scan-line. Hold black 12f before anything appears. |
| S2    | Static node graph                 | **Camera dolly** (scale 1.0 → 1.08 over 220f) + parallax on packets. Edges trace in sequence, not all at once. |
| S3    | Rings pulse, then nothing         | **5 rings**, last one breaks the 1920 frame, vignette darkens to 0.4 opacity, agent core gets a red corona flash on the final pulse |
| S4    | Typewriter is fine                | Add **chromatic aberration** (red/blue split 2px) on the malicious line; word "ignore" gets a 4f red flash + 3px horizontal shake |
| S5    | Reasoning cascade OK              | Lines cascade *faster each one* (14f → 10f → 7f → 5f). Arc timer becomes **a literal countdown clock** that snaps from 0.0 → 1.4s with a whip-pan blur |
| S6    | "BREACH" stamp                    | **Cut to pure black for 6f after "one"** (the silent beat). Then BREACH stamps with a 12f red full-screen flash, then snap-cut to white-on-red for 2f, then black. This is the climax. |
| S7    | Shield draws, DENIED rows         | Shield draws **then explodes outward** as a blue shockwave that wipes the screen. DENIED rows cascade with the shockwave passing over them. Each DENIED gets a unique deny stamp variant (different angle ±3°). |
| S8    | Terminal + 4 tiles, busy          | **Drop the terminal.** Replace with a **real product UI screenshot** (rendered from `src/pages/dashboard/Logs.tsx` via Playwright) sliding in from the right. 3 big stat numbers tick up *sequentially* on the left, terminal-style log scrolls in a thin strip at the bottom. |
| S9    | Wordmark + tagline                | Wordmark assembles per-letter, tagline mask-reveals, then **hold 8f of complete silence**, then a single bass-drop SFX + radial bloom + "Hunt us today · #1 on Product Hunt" chip slams in with a spring overshoot |

### 3. Sound design (rebuild, this time with restraint)

**Principle:** music *under* VO, SFX *between* VO. Silence is a sound.

**Music — 3 stems, sidechain-ducked under VO by -10dB:**
- `bed_dread.mp3` 0–18s — sub-bass drone, sparse piano hits on the 4 (Inception-style)
- `bed_chase.mp3` 18–38s — pulsing 16th-note synth arp, building filter sweep, tense
- `bed_anthem.mp3` 38–60s — cinematic brass + warm synth pad, hopeful resolution, brand-feel

**SFX (15, every one tied to a specific frame):**

| # | File                  | Frame  | Purpose                                  |
|---|-----------------------|--------|------------------------------------------|
| 1 | `sfx_cold_glitch.mp3` | 0      | Hard digital glitch on black             |
| 2 | `sfx_title_type.mp3`  | 30     | Subtle typewriter clicks under title     |
| 3 | `sfx_packet.mp3` ×3   | 180–360| Soft data blips on each node activation  |
| 4 | `sfx_ring_low.mp3` ×5 | S3 pulses | Each ring expansion (pitch rises ×5) |
| 5 | `sfx_typewriter.mp3`  | S4     | Realistic mechanical keys                |
| 6 | `sfx_glitch_stab.mp3` | S4 reveal | Malicious line reveal                 |
| 7 | `sfx_heartbeat.mp3`   | S5 loop| Agent obeying (BPM accelerates)          |
| 8 | `sfx_whip.mp3`        | S5 end | Whip-pan to S6                           |
| 9 | `sfx_tick.mp3` ×3     | S6 cnt | Countdown beats (sharp, dry)             |
|10 | **SILENCE**           | S6 mid | 6 frames of NO audio (huge impact)       |
|11 | `sfx_breach_boom.mp3` | S6 hit | Sub-bass impact + glass shatter          |
|12 | `sfx_shield_form.mp3` | S7     | Crystalline shield draw                  |
|13 | `sfx_shockwave.mp3`   | S7     | Energy wipe                              |
|14 | `sfx_deny_stamp.mp3` ×3 | S7 rows | Three distinct mechanical stamps      |
|15 | `sfx_brand_drop.mp3`  | S9     | Single bass drop on outro sting          |

**Mix bus:**
- VO: -2dB, light de-ess, slight presence shelf at 5kHz
- Music: -14dB clean, ducked to -22dB under VO via `sidechaincompress`
- SFX: -6dB, each pre-normalized to -3dB peak
- Master: `alimiter=limit=0.9:level=disabled`, true-peak ≤ -1dBFS

### 4. Product UI screenshot (new asset)

Capture a clean Logs page screenshot for S8:
1. Run dev server, navigate to `/dashboard/logs` via browser tool
2. Set viewport 1440×900, screenshot to `remotion/public/assets/dashboard-logs.png`
3. In S8, render with a thin signal-blue border, slide-in from right (x: 200 → 0 over 30f spring), subtle 0.5° rotation for depth

### 5. Technical execution

1. **Probe v3 VO timings**, rewrite scene durations to match new 138-word script + 0.4s tails
2. **Generate 9 VO calls** with per-scene `voice_settings` and request stitching → `remotion/public/audio/v4/vo/`
3. **Generate 3 music stems** (3× 22s chunks per stem, crossfaded) → `remotion/public/audio/v4/`
4. **Generate 15 SFX** in parallel → `remotion/public/audio/v4/`
5. **Capture product UI screenshot** via browser tool
6. **Rewrite 9 scene files** with v4 motion specs (each scene gets per-frame SFX trigger comments for the mux script)
7. **Update `ProductHuntVideo.tsx`** scene durations: S1=150 S2=210 S3=180 S4=210 S5=210 S6=180 S7=300 S8=210 S9=180 (totals to 1800f after 8×18f transitions)
8. **Re-render silent MP4** → `/tmp/anveguard-v4-silent.mp4`
9. **Mux with ffmpeg** — VO + 3-stem music with crossfades + 15 SFX with precise `adelay` + sidechain ducking + true-peak limiter + explicit silence windows → `/mnt/documents/anveguard-producthunt-60s-v4.mp4`
10. **QA pass** — extract 12 stills at every scene boundary AND mid-scene; verify visually with `code--view`; ffprobe for 60s ±0.5s, AAC stereo 192k, true-peak ≤ -1dBFS, no clipped frames

## Deliverable

`/mnt/documents/anveguard-producthunt-60s-v4.mp4` — 60s, 1920×1080, narration, scored, sound-designed, with one real product screenshot. v3 stays untouched for comparison.

## What's explicitly *not* in scope

- No frontend/product code changes (S8 screenshot is a one-shot capture)
- No 9:16 vertical cut (separate ask)
- No teaser/15s cut (separate ask)
- No subtitle/caption burn-in (PH plays with sound on by default)

## Risk register

- **ElevenLabs SFX 22s cap** → music stems generated as 3× chunks, crossfaded
- **Per-scene voice_settings** may produce inconsistent timbre → mitigate by keeping `similarity_boost=0.8` constant across all 9 calls
- **Silence beats** must survive the `alimiter` → use `volume=0` segments in the filter graph, not gaps (gaps get filled by limiter noise floor)
- **Screenshot capture** may fail if dev server slow → fallback to a hand-built React component that mimics the Logs UI in Remotion directly
