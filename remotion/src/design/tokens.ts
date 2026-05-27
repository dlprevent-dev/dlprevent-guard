import { loadFont as loadSans } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: sans } = loadSans("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
const { fontFamily: mono } = loadMono("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

export const FONTS = { sans, mono };

export const C = {
  ink: "#0A0E18",
  panel: "#0F1524",
  panel2: "#131A2E",
  rule: "#1B2236",
  ruleSoft: "rgba(120,140,180,0.14)",
  paper: "#EDEFF5",
  muted: "#8A93A6",
  mutedSoft: "#5C6680",
  signal: "#5B8DEF",
  signalSoft: "rgba(91,141,239,0.18)",
  ok: "#3DDC97",
  alert: "#FF6B6B",
};

export const SPRING = {
  enter: { damping: 22, stiffness: 180, mass: 1 },
  accent: { damping: 12, stiffness: 220, mass: 1 },
  smooth: { damping: 200 },
};
