# AnveGuard Product Hunt Video — v3 Polish Pass

Goal: take `anveguard-producthunt-60s-v2.mp4` from "good motion graphics with a music bed" to a **launch-grade 60s film** with a real story, an ElevenLabs voiceover that carries the narrative, and sound design that punches every beat.

## 1. Rewrite the story (tighter, more human)

Current arc is solid (Setup → Crisis → Resolution) but feels abstract. New script, ~145 words, paced to 60s with breathing room:

| Time | Scene | VO line |
|---|---|---|
| 0–6s | S1 Title | "Your AI agent isn't a tool anymore. It's an employee — with the keys to everything." |
| 6–13s | S2 Day in Life | "Every day it reads your issues, your database, your secrets. Thousands of times." |
| 13–20s | S3 Blast Radius | "One agent. One prompt. The blast radius of your entire company." |
| 20–27s | S4 Trap | "Then someone hides a single line in a GitHub issue…" |
| 27–34s | S5 Obeys | "…and your agent obeys. In 1.4 seconds, it's already moving." |
| 34–40s | S6 Countdown | "Three seconds to exfiltration. No alert. No log. No chance." |
| 40–48s | S7 Intercept | "AnveGuard sits in front of every prompt, every tool call, every response. Inspected in under 15 milliseconds. Denied." |
| 48–55s | S8 Receipts | "Zero bytes leaked. Two hundred forty-seven kilobytes saved. Signed, replayable, done." |
| 55–60s | S9 Outro | "AnveGuard. The runtime firewall for AI agents." |

Voice: ElevenLabs **Brian** (`nPczCjzI2devNBz1zQrb`) — calm, authoritative, trailer-grade. Model `eleven_multilingual_v2`, stability 0.45, similarity 0.8, style 0.35.

## 2. Story / motion improvements per scene

- **S1**: Hold title 0.5s longer; add subtle camera push-in (1.0 → 1.04 scale over 130f).
- **S2**: Slow the packet cycle from 80f → 110f so eye can track; dim non-active edges.
- **S3**: Add a fourth, larger ring that breaks the frame on the last pulse — visual "oh shit" moment synced to VO "entire company."
- **S4**: After typewriter completes, the malicious line gets a red underline draw + glitch shake (3f amplitude 4px) on the word "ignore."
- **S5**: Reasoning lines should cascade faster (one every 8f instead of 14f) so the 1.4s arc timer feels urgent. Add a heartbeat pulse on the agent core.
- **S6**: Replace 3→2→1 with **03 · 02 · 01 · BREACH**, last word stamping full-screen red for 6f then cut.
- **S7**: Shield draws THEN the three DENIED rows cascade in rhythm with three impact SFX (one per row). Add a brief screen-flash signal-blue on each deny.
- **S8**: Stat tiles tick up sequentially (not in parallel) so each number lands with its own tick SFX; terminal log auto-scrolls.
- **S9**: Wordmark assembly stays; add a final 12f signal-blue radial bloom behind it on the last VO word.

## 3. Sound design (rebuild from scratch)

Discard the current SFX layout — too cluttered. New plan, all via ElevenLabs SFX API, saved to `remotion/public/audio/v2/`:

**Music bed (3 stems, crossfaded):**
- `bed_setup.mp3` (0–20s) — ambient pad, low pulse, "watchful calm"
- `bed_tension.mp3` (18–40s) — sub-bass riser, ticking percussion, growing dread
- `bed_resolution.mp3` (38–60s) — cinematic anthem, hopeful brass + synth, triumphant

**SFX (12, precise):**
- `vo_whoosh.mp3` @ 0.0s — title swoosh
- `data_pulse.mp3` looped @ 6–13s — soft packet blips
- `ring_pulse.mp3` ×3 @ 13.5, 15.5, 18s — ominous low booms
- `typewriter.mp3` @ 20–25s — keys
- `glitch_stab.mp3` @ 25.5s — malicious line reveal
- `heartbeat.mp3` looped @ 27–34s — agent obeying
- `tick.mp3` ×3 @ 34, 35.5, 37s — countdown beats
- `breach_impact.mp3` @ 39s — full-screen red stamp
- `shield_form.mp3` @ 40s — shield draw-on
- `deny_stamp.mp3` ×3 @ 42, 44, 46s — DENIED rows
- `success_chime.mp3` @ 49s — "zero bytes"
- `brand_riser.mp3` @ 55s — outro swell

**Voiceover ducking:** music bed automatically ducks -8 dB during VO segments via ffmpeg `sidechaincompress`. VO sits at -2 dB, music at -14 dB under VO / -10 dB clean.

## 4. Technical execution

1. **Generate VO**: one script call per scene line (9 calls) using ElevenLabs TTS with request stitching (previous_text/next_text) for natural prosody. Save to `remotion/public/audio/v2/vo/scene_N.mp3`.
2. **Probe each VO** with `ffprobe` to get exact durations, then **rebalance scene frame counts** so each scene fits its VO + 0.5s tail. Update `ProductHuntVideo.tsx` durations.
3. **Generate 3 music stems + 12 SFX** via ElevenLabs SFX endpoint, in parallel.
4. **Add VO playback inside Remotion** using `<Audio src={staticFile('audio/v2/vo/scene_N.mp3')} />` per scene — so timing stays in sync with motion edits during re-renders.
5. **Edit motion improvements** in the 9 scene files per section 2.
6. **Re-render** the silent MP4 via `scripts/render-remotion.mjs` to `/mnt/documents/anveguard-producthunt-60s-v3-silent.mp4`.
7. **Final mux** with ffmpeg: VO + 3-stem music crossfade + 12 SFX + sidechain ducking + alimiter. Output → `/mnt/documents/anveguard-producthunt-60s-v3.mp4`.
8. **QA**: extract 6 stills at key beats, verify visually; ffprobe the final to confirm 60s, AAC stereo 192k, peak ≤ -1 dBFS.

## Deliverable

`/mnt/documents/anveguard-producthunt-60s-v3.mp4` — 60s, 1920×1080, with narration, music, and SFX. Previous v2 stays untouched for comparison.

## Risks / notes

- ElevenLabs SFX max 22s per call → music stems generated as 2× 10–11s chunks per stem and crossfaded.
- If total VO runs >58s I'll trim filler words, not cut beats.
- No changes to product/frontend code — all work is in `remotion/` and `/mnt/documents/`.
