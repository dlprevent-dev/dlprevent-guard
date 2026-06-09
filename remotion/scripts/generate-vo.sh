#!/usr/bin/env bash
# generate-vo.sh — regenerate the 9 per-scene ElevenLabs VO clips for v5.
#
# Usage:
#   export ELEVENLABS_API_KEY=sk_...
#   bash remotion/scripts/generate-vo.sh
#
# Optional env:
#   VOICE_ID         — defaults to "21m00Tcm4TlvDq8ikWAM" (Rachel, ElevenLabs sample)
#                      Pick from `curl -H "xi-api-key: $K" https://api.elevenlabs.io/v1/voices`
#   MODEL_ID         — defaults to "eleven_turbo_v2_5" (fastest, English-best)
#   OUT_DIR          — defaults to remotion/public/audio/v5/vo/
#   STABILITY        — 0..1, default 0.55 (a touch expressive)
#   SIMILARITY_BOOST — 0..1, default 0.75
#   STYLE            — 0..1, default 0.0 (neutral)
#   SPEAKER_BOOST    — true/false, default true

set -euo pipefail

: "${ELEVENLABS_API_KEY:?Set ELEVENLABS_API_KEY before running}"

VOICE_ID="${VOICE_ID:-21m00Tcm4TlvDq8ikWAM}"
MODEL_ID="${MODEL_ID:-eleven_turbo_v2_5}"
STABILITY="${STABILITY:-0.55}"
SIMILARITY_BOOST="${SIMILARITY_BOOST:-0.75}"
STYLE="${STYLE:-0.0}"
SPEAKER_BOOST="${SPEAKER_BOOST:-true}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/public/audio/v5/vo}"
SCRIPT="$ROOT/public/audio/v5/VO_SCRIPT.txt"
mkdir -p "$OUT_DIR"

echo "🎙  ElevenLabs VO generator"
echo "    voice  : $VOICE_ID"
echo "    model  : $MODEL_ID"
echo "    output : $OUT_DIR"

# Parse the script: each section is [scene_X] followed by lines until next [.
# Comment lines (starting with #) and blank lines are skipped.

awk -v out="$OUT_DIR" '
  /^\[/ {
    if (cur != "" && body != "") {
      f = out "/" cur ".txt"
      print body > f
      close(f)
    }
    gsub(/[\[\]]/, "", $0)
    cur = $0
    body = ""
    next
  }
  /^#/ || /^[[:space:]]*$/ { next }
  { body = (body == "" ? $0 : body " " $0) }
  END {
    if (cur != "" && body != "") {
      f = out "/" cur ".txt"
      print body > f
      close(f)
    }
  }
' "$SCRIPT"

# Now read each per-scene txt and call ElevenLabs.
for f in "$OUT_DIR"/scene_*.txt; do
  scene="$(basename "$f" .txt)"
  text="$(cat "$f")"
  mp3="$OUT_DIR/$scene.mp3"
  echo ""
  echo "→ $scene  ($(echo "$text" | wc -w | tr -d ' ') words)"
  printf "  %s\n" "$text"
  # Wrap the payload via jq to handle quoting properly.
  body=$(jq -nc \
    --arg t "$text" \
    --arg m "$MODEL_ID" \
    --argjson s "$STABILITY" \
    --argjson sb "$SIMILARITY_BOOST" \
    --argjson st "$STYLE" \
    --argjson spk "$SPEAKER_BOOST" \
    '{text:$t, model_id:$m, voice_settings:{stability:$s,similarity_boost:$sb,style:$st,use_speaker_boost:$spk}}')
  http=$(curl -sS -w '%{http_code}' -o "$mp3.tmp" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" \
    -H "Content-Type: application/json" \
    -X POST "https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128" \
    -d "$body")
  if [ "$http" != "200" ]; then
    echo "  ❌ HTTP $http — response saved to $mp3.error.json" >&2
    mv "$mp3.tmp" "$mp3.error.json"
    exit 1
  fi
  mv "$mp3.tmp" "$mp3"
  # Print actual duration for offset planning.
  if command -v ffprobe >/dev/null 2>&1; then
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$mp3" 2>/dev/null)
    printf "  ✓ %s — %.2fs\n" "$(basename "$mp3")" "$dur"
  fi
done

echo ""
echo "✓ Generated $(ls "$OUT_DIR"/scene_*.mp3 2>/dev/null | wc -l | tr -d ' ') VO files in $OUT_DIR"
echo ""
echo "Next: re-run the mux script to overlay them onto the rendered video:"
echo "  bash $ROOT/scripts/mux-audio.sh"
