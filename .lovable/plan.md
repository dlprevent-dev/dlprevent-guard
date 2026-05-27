
## Goal

Reposition AnveGuard from "feature-rich infra" to **the runtime governance layer for autonomous AI** — without rewriting the hero. We add emotional urgency (consequences, not capabilities), one iconic interactive demo, and two content wedges (MCP + research) that compound into SEO, GitHub stars, and enterprise trust.

---

## What ships

### 1. Landing-page additions (in `src/pages/Landing.tsx`)

**A. "Without / With AnveGuard" urgency strip** — placed directly under the hero stat strip, above the existing "Change one URL" section.

```text
┌───────────────────────────────────┬───────────────────────────────────┐
│  WITHOUT ANVEGUARD                │  WITH ANVEGUARD                   │
│  GitHub issue hides instructions  │  Injection detected at input      │
│  Agent reads .env + secrets       │  Tool call denied · not in scope  │
│  MCP tool runs privileged action  │  Outbound domain rejected         │
│  Data exfiltrated externally      │  Audit row written · alert fires  │
└───────────────────────────────────┴───────────────────────────────────┘
```

Two-column band, left side rendered with `text-status-err` tone (danger), right side `text-status-ok` (contained). Pure semantic tokens, no custom colors.

**B. Scripted attack-trace terminal demo** — new component `src/components/landing/AttackTraceDemo.tsx`, placed between the new Threats section and Tool governance section.

- A single terminal panel that auto-types ~8 lines of an attack chain at ~70ms/line (respects `prefers-reduced-motion` → renders all lines instantly).
- Lines mix `[user]`, `[agent]`, `[anveguard]`, `[tool]`, `[audit]` prefixes with monospace tokenized colors.
- Climaxes with `✓ tool call blocked · policy: outbound_allowlist` and `✓ audit:#a91f written`.
- "Replay" button restarts the trace. No user input, no backend, no state machine — just a setTimeout loop over a static array.
- Caption underneath: *"Real trace from the policy engine test corpus. Zero apps were harmed."*

**C. Repositioned subhead reinforcement** (no headline change) — under the existing CTAs, add a one-line strap: *"Runtime governance for autonomous AI — prompt injection, tool execution, exfiltration, spend, audit."* Small text, muted. Keeps the user's "keep hero" preference but plants the broader category.

**D. Nav update** — add `MCP` and `Research` links in `NAV`; both route to new pages below.

### 2. New page: `/mcp` (MCP security wedge)

File: `src/pages/Mcp.tsx`, route added in `src/App.tsx`, sitemap entry added.

Sections (top → bottom):
1. **Hero** — "MCP security, before MCP eats production." Subhead about capability sprawl.
2. **The MCP threat model** — diagram + prose covering: untrusted tool descriptions, tool shadowing, cross-server reference, capability creep, prompt-via-tool-result (the XPIA path already in `policy_engine.ts`).
3. **MCP hardening checklist** — 10 concrete items (capability allowlists per key, domain egress, schema validation, etc.) with checkmarks.
4. **AnveGuard for MCP** — three short cards mapping each checklist concern to an AnveGuard primitive (policy / tool layer / audit).
5. **CTA** — link to Connect + docs.

Adds JSON-LD `TechArticle`, proper `<Seo>` tags, and one OG image reference.

### 3. New content hub: `/research`

File: `src/pages/Research.tsx` (index) + `src/pages/research/` directory for posts. Route + sitemap entries.

- Index lists posts with title, dek, read time, date — clean list, no card noise.
- Three starter long-form posts (each its own MDX-free `.tsx` page using the existing `DocsLayout` primitives so we don't add new infrastructure):
  - `/research/top-10-mcp-vulnerabilities` — original analysis, mapped to OWASP MCP Top 10.
  - `/research/how-ai-agents-leak-secrets` — the exfiltration patterns AnveGuard's risk-trio detector catches.
  - `/research/runtime-governance-for-ai` — the category-defining essay (Cloudflare-for-AI framing).
- Each post: `<Seo>` with `Article` JSON-LD (author = "AnveGuard Research", datePublished, image), proper H1, internal links to docs.

### 4. SEO + plumbing

- `public/sitemap.xml`: add `/mcp`, `/research`, and the three research URLs.
- `public/robots.txt`: confirm allow for new paths (already permissive).
- `public/llms.txt` and `public/llms-full.txt`: append summaries of /mcp and /research so agent crawlers index the wedge content.
- `public/.well-known/ai-plugin.json`: add the two new endpoints under `documentation_urls`.
- Footer in `Landing.tsx`: add links to MCP and Research.

### 5. README polish (small)

- Add a one-line tagline under the H1: *"Runtime governance for autonomous AI."*
- New short "Without / With AnveGuard" code block mirroring the landing strip.
- Link to `/mcp` and `/research` from the "Why AnveGuard" section.

---

## Out of scope (intentionally)

- No hero headline change (user picked "keep current hero").
- No interactive step-through or split-screen demo (user picked scripted terminal).
- No actual backend for the demo — it's pure presentational.
- No new design system tokens; everything uses existing `surface-*`, `status-*`, `primary`, `border` semantic tokens.
- No MDX, no new content framework. Research posts are plain TSX using existing docs primitives.

---

## Technical notes

- **AttackTraceDemo**: implemented with `useEffect` + a ref-based timer queue so unmount cleans up. Reduced-motion check via `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
- **Research/MCP pages**: reuse `DocsLayout`'s `DocPage`, `H2`, `P`, `Lead`, `UL`, `Pre`, `Callout` to keep zero-new-CSS. They live outside `/docs` route-wise but borrow the components.
- **App.tsx routes**: add `<Route path="/mcp" element={<Mcp />} />` and the research routes; keep them outside `DashboardLayout`.
- **JSON-LD**: extend the existing `Seo` component usage; no new helpers needed.
- **No new dependencies.** No font, icon, or animation library additions — `lucide-react` already imported is sufficient.
- **Files touched / created** (estimate):
  - edit: `src/pages/Landing.tsx`, `src/App.tsx`, `README.md`, `public/sitemap.xml`, `public/llms.txt`, `public/llms-full.txt`, `public/.well-known/ai-plugin.json`
  - create: `src/components/landing/AttackTraceDemo.tsx`, `src/pages/Mcp.tsx`, `src/pages/Research.tsx`, `src/pages/research/Top10McpVulnerabilities.tsx`, `src/pages/research/HowAiAgentsLeakSecrets.tsx`, `src/pages/research/RuntimeGovernanceForAi.tsx`

---

## Order of implementation

1. AttackTraceDemo component + Without/With strip + nav links (visible on landing immediately).
2. /mcp page + route + sitemap.
3. /research index + 3 posts + routes + sitemap.
4. SEO files (llms.txt, ai-plugin.json) + README polish.
5. Quick visual pass across the landing page at 1080×804 viewport.
