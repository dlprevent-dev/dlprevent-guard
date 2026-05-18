import type { TourStep } from "@/components/guided-tour";

/**
 * Tour configurations for the whole platform.
 *
 * Each export is a TourStep[] ready to pass into <GuidedTour>. Tours target
 * `data-tour="…"` selectors so they survive class-name churn. Selectors used
 * here come from:
 *   - `nav-overview`, `nav-connect`, `nav-policies`, `nav-threats`,
 *     `nav-logs`, `nav-playground`, `nav-alerts`, `nav-keys` — added to
 *     dashboard-sidebar.tsx NavLink components
 *   - `threats-hero`, `threats-kpis`, `threats-range`, `threats-help` —
 *     existing markers on the Threats page
 *   - `logs-tabs`, `logs-tab-security`, `logs-help` — existing markers on
 *     the Logs page
 *
 * Tour IDs (used for localStorage visited-tracking):
 *   - `platform-v1` — full-platform tour, 12 steps
 *   - `setup-v1` — first-setup walkthrough, 6 steps
 *
 * To re-take any tour, clear `localStorage["tour-visited:<id>"]`.
 */

/**
 * The full platform tour. Walks the user through every major dashboard
 * surface, navigating between pages. ~12 steps, ~3 minutes to complete.
 */
export const PLATFORM_TOUR: TourStep[] = [
  {
    selector: '[data-tour="nav-overview"]',
    title: "Welcome — let's tour AnveGuard",
    body: "About 12 stops, takes about 3 minutes. You can quit anytime with Skip or Esc, and re-run from the Help menu. Let's start with the Overview.",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-overview"]',
    title: "Overview — your daily home",
    body: "Top-line metrics, recent activity, and quick links. This is the page your team will hit first each morning.",
    placement: "auto",
    navigate: "/dashboard",
  },
  {
    selector: '[data-tour="nav-connect"]',
    title: "Connect — set up a provider",
    body: "Where new users start. One short wizard creates an endpoint + an AnveGuard key + a model alias in one pass. Pick from OpenAI / Anthropic / Perplexity / OpenRouter / Gemini / Groq / Ollama / custom.",
    navigate: "/dashboard/connect",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-keys"]',
    title: "API Keys — the keys your apps send",
    body: "Manage your ag_live_… keys. Each key is bound to one or more endpoints, can have model aliases (fast / cheap / smart), and is SHA-256 hashed — only the prefix is recoverable.",
    navigate: "/dashboard/keys",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-policies"]',
    title: "Policies — what gets blocked",
    body: "Keyword guardrails, regex patterns, intent classifiers, output rules. Simple mode for fast setup; Advanced for power users. Every saved policy applies to all proxy traffic in your workspace.",
    navigate: "/dashboard/policies",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-threats"]',
    title: "Threats — live SOC view",
    body: "What the engine just blocked, by layer, with time-series. The hero card has 3 states (Waiting / All clear / N blocked) so a glance is enough.",
    navigate: "/dashboard/threats",
    placement: "auto",
  },
  {
    selector: '[data-tour="threats-hero"]',
    title: "Single-glance status",
    body: "Color-coded operational read of the selected time window. Click the time-range selector top-right to widen out to 7d / 30d.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-logs"]',
    title: "Logs — full audit history",
    body: "Every request, response, verdict, latency, model. Three tabs: Requests, Security events, Audit log. Each row has a Replay button that re-runs the prompt through Playground.",
    navigate: "/dashboard/logs",
    placement: "auto",
  },
  {
    selector: '[data-tour="logs-tabs"]',
    title: "Three views, one source",
    body: "Requests is the firehose; Security events filters to blocks/flags/throttles; Audit log is admin actions (key created, policy changed). Replay any of them.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-playground"]',
    title: "Playground — try requests live",
    body: "Send any prompt through your proxy and watch every policy layer decide in real time. Great for testing new policies before they go live.",
    navigate: "/dashboard/playground",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-alerts"]',
    title: "Alerts — webhook subscriptions",
    body: "Get a webhook on blocked-attack spikes, anomalous traffic, token-spend thresholds, account-takeover signals. HMAC-signed delivery + retries.",
    navigate: "/dashboard/alerts",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-overview"]',
    title: "That's the platform",
    body: "Re-run this tour from the Help menu in the topbar anytime. Each page also has its own short tour (look for the Tour button). Happy guarding.",
    navigate: "/dashboard",
    placement: "auto",
  },
];

/**
 * The first-setup walkthrough. Replaces the modal-only onboarding with a
 * hands-on tour that points at the actual UI the user needs to click. ~6
 * steps, ~90 seconds.
 *
 * Unlike PLATFORM_TOUR (educational), SETUP_TOUR is *operational* — it
 * walks the user from zero to "first request sent" by spotlighting the
 * real buttons and inputs.
 */
export const SETUP_TOUR: TourStep[] = [
  {
    selector: '[data-tour="nav-connect"]',
    title: "Step 1 — Click Connect",
    body: "We'll set up your first provider together. Click this nav item, then come back — the tour will follow you to the next step automatically.",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-connect"]',
    title: "Step 2 — Connect lives here",
    body: "The Connect wizard creates an endpoint, an AnveGuard key, and a model alias in one pass. We're heading there now.",
    navigate: "/dashboard/connect",
    placement: "auto",
  },
  {
    selector: 'main',
    title: "Step 3 — Pick a provider",
    body: "On this page, click any provider tile (OpenAI / Anthropic / etc.) to start. The wizard will walk you through pasting a key, naming the AnveGuard key, and saving.",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-keys"]',
    title: "Step 4 — Your key shows up here",
    body: "After you finish the Connect wizard, your new ag_live_… key appears under API Keys. Copy it once — only the hash is stored after that.",
    navigate: "/dashboard/keys",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-playground"]',
    title: "Step 5 — Test your first proxied request",
    body: "Use the Playground to send a real prompt with your new key. Every policy layer evaluates in real time so you can see exactly what AnveGuard catches.",
    navigate: "/dashboard/playground",
    placement: "auto",
  },
  {
    selector: '[data-tour="nav-logs"]',
    title: "Step 6 — Audit lives here",
    body: "Every proxy call appears in Logs with its verdict, latency, and policy-layer breakdown. From any row you can Replay it through the Playground.",
    navigate: "/dashboard/logs",
    placement: "auto",
  },
];

/**
 * Registry — tour metadata keyed by id. Used by the Help menu to show
 * "Take the platform tour" / "Take the setup tour" entries with the
 * right label + duration estimate.
 */
export const TOUR_REGISTRY = {
  "platform-v1": {
    id: "platform-v1",
    label: "Take the platform tour",
    description: "Walk through every major dashboard surface (~3 min, ~12 stops).",
    steps: PLATFORM_TOUR,
    finishLabel: "All done",
  },
  "setup-v1": {
    id: "setup-v1",
    label: "Take the setup walkthrough",
    description: "Hands-on guide to your first proxied request (~90s, 6 steps).",
    steps: SETUP_TOUR,
    finishLabel: "Got it",
  },
} as const;

export type TourId = keyof typeof TOUR_REGISTRY;
