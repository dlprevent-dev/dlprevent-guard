## Goal

1. Position AnveGuard as open source on the landing page and link to the real repo: `https://github.com/ANVE-AI/prompt-sentinel-flow`.
2. Run the full test matrix (lint, typecheck, unit, edge-function Deno tests, build) and report results.

## Landing page changes (`src/pages/Landing.tsx`)

- **Top bar**: add a "GitHub" icon link (with a small star/`Open source` chip) pointing to the repo, next to "Sign in".
- **Hero**: add an "Open source · Apache 2.0" eyebrow chip above the headline and a secondary "Star on GitHub" button next to the primary CTA.
- **Stat strip**: replace one stat with "Apache 2.0 · Open source" (or add as a 5th item if it fits).
- **New compact section "Open source"** placed after the Quote / before FAQ:
  - One-line pitch: built in the open, self-hostable, Apache 2.0.
  - Three bullets: full source on GitHub · self-host the proxy + dashboard · PRs welcome (link to CONTRIBUTING.md on GitHub).
  - Buttons: "View on GitHub" and "Read the docs".
- **Footer**: replace placeholder `https://github.com` with the real repo URL; add "Apache 2.0" + repo link line.

All copy uses existing semantic tokens; no new colors. Mobile layout preserved (stack on `<md`).

## Tests to run (sequentially, report each)

```
bun run lint
bun run typecheck
bun run test
bun run build
cd supabase/functions && deno test --allow-env --allow-net --allow-read --no-check
```

Optionally smoke-check the live URLs (`/`, `/docs`) with `curl -sI` and the deployed `proxy` edge function health.

I will not run Playwright e2e (requires `e2e/.env.e2e` with live credentials — out of scope unless you provide them).

## Out of scope

- Re-running the cosmetic Lovable scrub (already done).
- Any backend / policy-engine changes.
- License file changes (LICENSE already Apache 2.0).

## Deliverable

Landing page shows clear open-source positioning with working GitHub links, plus a test report in chat with pass/fail per gate.
