// Mac-friendly render — bundles + renders the ProductHuntVideo composition to ~/Desktop.
// Uses the system Chrome (Remotion auto-detects) instead of /bin/chromium.
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compId = process.env.COMPOSITION ?? "productHunt";
const out = process.env.OUT ?? path.join(os.homedir(), "Desktop", `anveguard-${compId}.mp4`);

console.log("Bundling Remotion…");
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (c) => c,
});

console.log("Selecting composition:", compId);
const composition = await selectComposition({ serveUrl: bundled, id: compId });

console.log(`Rendering → ${out}`);
await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: out,
  // keep audio (scenes pull v2/vo/scene_*.mp3 inline)
  concurrency: null,
  imageFormat: "jpeg",
  jpegQuality: 90,
});
console.log("Done →", out);
