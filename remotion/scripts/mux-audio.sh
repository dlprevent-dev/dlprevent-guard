#!/usr/bin/env bash
# mux-audio.sh — overlay per-scene VO + optional bed music onto the rendered MP4.
#
# Defaults: uses public/audio/v5/vo if it has 9 mp3s, else falls back to v2/vo.
# Output: ~/Desktop/anveguard-productHunt-final.mp4
#
# Usage:
#   bash remotion/scripts/mux-audio.sh                           # use v5 (newest VO)
#   VO_DIR=public/audio/v2/vo bash remotion/scripts/mux-audio.sh # use v2 (older VO)
#   IN=$HOME/Desktop/anveguard-productHunt.mp4 \
#     OUT=$HOME/Desktop/final.mp4 \
#     bash remotion/scripts/mux-audio.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IN="${IN:-$HOME/Desktop/anveguard-productHunt.mp4}"
OUT="${OUT:-$HOME/Desktop/anveguard-productHunt-final.mp4}"

# Pick the latest VO directory by default — v5 if present, else v2.
if [ -z "${VO_DIR:-}" ]; then
  if [ -d "$ROOT/public/audio/v5/vo" ] && \
     [ "$(ls "$ROOT/public/audio/v5/vo"/scene_*.mp3 2>/dev/null | wc -l | tr -d ' ')" = "9" ]; then
    VO_DIR="$ROOT/public/audio/v5/vo"
  else
    VO_DIR="$ROOT/public/audio/v2/vo"
  fi
fi

echo "🎬 mux-audio"
echo "    video in  : $IN"
echo "    VO dir    : $VO_DIR"
echo "    output    : $OUT"

# Per-scene start times in seconds (computed from 30fps composition durations:
#   170/215/180/190/215/170/300/305/199 with 18f transition overlap each cut)
declare -a STARTS=(0.0 5.07 11.63 17.03 22.77 29.33 34.40 43.80 53.37)

# Build ffmpeg filter graph: delay each VO by its scene's start, mix into one track.
INPUTS=("-i" "$IN")
FILTER=""
MIX=""
for i in 1 2 3 4 5 6 7 8 9; do
  mp3="$VO_DIR/scene_$i.mp3"
  if [ ! -f "$mp3" ]; then
    echo "  ⚠️  missing $mp3 — skipping scene $i" >&2
    continue
  fi
  INPUTS+=("-i" "$mp3")
  # ffmpeg input index for this mp3 = i (because video is input 0)
  delay_ms=$(awk -v s="${STARTS[$((i-1))]}" 'BEGIN{printf "%d", s*1000}')
  FILTER+="[$i:a]adelay=${delay_ms}|${delay_ms}[a$i];"
  MIX+="[a$i]"
done

if [ -z "$MIX" ]; then
  echo "❌ No VO files found in $VO_DIR" >&2
  exit 1
fi

# Mix all delayed VOs into a single audio track + mux with the original video.
NMIX=$(echo "$MIX" | tr -cd '[' | wc -c | tr -d ' ')
# amix produces a track as long as the longest input — but the LAST VO ends
# before the video does, so pad with silence to the full video length so we
# don't truncate the outro. `apad` pads forever; `-t` clamps to video length.
FILTER+="${MIX}amix=inputs=${NMIX}:duration=longest:dropout_transition=0:normalize=0,apad[vo]"

VIDEO_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
ffmpeg -y "${INPUTS[@]}" \
  -filter_complex "$FILTER" \
  -map 0:v -map "[vo]" \
  -c:v copy -c:a aac -b:a 192k -t "$VIDEO_DUR" \
  "$OUT" \
  2>&1 | tail -8

if command -v ffprobe >/dev/null 2>&1; then
  echo ""
  echo "✓ Output:"
  ffprobe -v error -show_entries stream=codec_type,codec_name -of csv=p=0 "$OUT" 2>&1
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
  vol=$(ffmpeg -nostdin -i "$OUT" -af volumedetect -f null - 2>&1 | grep mean_volume | head -1)
  printf "  duration: %ss\n" "$dur"
  echo "  $vol"
  echo "  path    : $OUT"
fi
