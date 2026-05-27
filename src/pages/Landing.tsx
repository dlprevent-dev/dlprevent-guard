import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Github, Check, HelpCircle, RotateCcw, ArrowDown, ShieldAlert, Ban, Terminal, Globe, Database, GitBranch, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { CodeTabs } from "@/components/landing/CodeTabs";
import { HeroProductVisual } from "@/components/landing/HeroProductVisual";
import { QuickstartHelpPanel } from "@/components/quickstart-help-panel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Seo } from "@/components/seo";

/**
 * Landing page — YC-style "high-signal, low-decoration" layout.
 *
 * Design rules followed throughout:
 *  - One accent color (primary). No gradients, no glows, no scanlines.
 *  - Monospace eyebrows for section labels; tight, large display headings.
 *  - Real content (numbers, snippets, prose) over visual flourishes.
 *  - Thin 1px borders separate sections; no card shadows.
 *  - Mobile-first: every section has px-4 md:px-6 padding and stacks cleanly.
 *
 * Sections, in order:
 *   1. Top bar               – brand, in-page nav, sign-in / get-started
 *   2. Hero                  – headline, subhead, CTA, stat strip
 *   3. Drop-in snippet       – "change one URL" code tabs
 *   4. What it does          – three columns: Inspect / Enforce / Audit
 *   5. How it works          – numbered three-step prose
 *   6. Quote                 – single operator quote, dense prose
 *   7. FAQ                   – four common operator questions
 *   8. CTA                   – flat dark band, two buttons
 *   9. Footer                – brand, status, links
 */

const GITHUB_URL = "https://github.com/ANVE-AI/prompt-sentinel-flow";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#threats", label: "Threats" },
  { href: "#tools", label: "Tool governance" },
  { href: "#observability", label: "Observability" },
  { href: "#how", label: "Quickstart" },
  { href: "/docs", label: "Docs" },
];

const STATS: { value: string; label: string }[] = [
  { value: "<5ms", label: "Median proxy overhead" },
  { value: "18+", label: "AI providers supported" },
  { value: "4", label: "Modalities — chat, image, audio in/out" },
  { value: "100%", label: "Catch rate on 30+ attack-vector test corpus" },
];

const PILLARS: { eyebrow: string; title: string; body: string; bullets: string[] }[] = [
  {
    eyebrow: "01 / Inspect",
    title: "Every prompt and response, searchable.",
    body: "A live request log with status, latency, model, key, and the full payload — plus token spike alerts with a calibratable severity score so anomalies surface early.",
    bullets: ["Live tail with auto-refresh", "Token spike alerts (in/out)", "Severity score 0–100"],
  },
  {
    eyebrow: "02 / Enforce",
    title: "Policies that run before the request leaves.",
    body: "Allow/blocklists and a custom block message. Update in the dashboard — no redeploy, no SDK upgrade.",
    bullets: ["Keyword & regex rules", "Per-key or workspace-wide", "Custom block response"],
  },
  {
    eyebrow: "03 / Audit",
    title: "An immutable trail of everything that changed.",
    body: "Key creation, revocation, policy edits, endpoint changes — captured with actor, timestamp, and metadata.",
    bullets: ["Compliance-ready format", "Filter by actor or action", "Export via the dashboard API"],
  },
];

const STEPS: { n: string; title: string; body: string; cta: string; to: string }[] = [
  {
    n: "01",
    title: "Connect one or many LLMs",
    body: "Paste keys for OpenAI, Anthropic, OpenRouter, Perplexity, Ollama — as many providers as you want, under a single workspace. Provider keys are AES-GCM encrypted and never returned to clients.",
    cta: "Connect a provider",
    to: "/dashboard/connect",
  },
  {
    n: "02",
    title: "Get one AnveGuard key",
    body: "One ag_live_… key fronts your workspace — whether that's a single provider (1:1) or a dozen (N:1). Apps pass model=\"...\" and AnveGuard routes accordingly, all governed by the same policies.",
    cta: "Open Connect wizard",
    to: "/dashboard/connect",
  },
  {
    n: "03",
    title: "Call any model from any app",
    body: "Drop-in OpenAI-compatible base URL. Every call runs through intent, keyword, behavioral, and PII layers, then lands in Logs with a full audit trail.",
    cta: "Open Playground",
    to: "/dashboard/playground",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need to change my code?",
    a: "Only the base URL and the API key. Anything that speaks the OpenAI Chat Completions API works without further changes — including the official OpenAI SDKs in Python, Node, and Go.",
  },
  {
    q: "Where does my provider key live?",
    a: "Encrypted in the dashboard, never shipped to your client or runtime. Your application only ever holds an AnveGuard key, which you can rotate or revoke instantly.",
  },
  {
    q: "What's the latency overhead?",
    a: "Median added latency is under 5ms in the same region. Streaming responses are forwarded chunk-by-chunk, so time-to-first-token is preserved.",
  },
  {
    q: "Is it free to start?",
    a: "Yes. The free tier covers everything most teams need to evaluate AnveGuard end-to-end, including policies, audit logs, and the request explorer.",
  },
];

const SECTION_IDS = ["product", "threats", "tools", "observability", "how", "faq"];

// Threat scenarios — real attack narratives, not feature lists. Security
// buyers think in incidents and blast radius, not detectors.
const THREATS: { id: string; title: string; blastRadius: string; chain: { icon: typeof ShieldAlert; label: string; tone?: "danger" | "ok" }[] }[] = [
  {
    id: "indirect-injection",
    title: "Indirect prompt injection via GitHub issue",
    blastRadius: "Repo secrets · CI tokens · production credentials",
    chain: [
      { icon: FileCode, label: "GitHub issue contains hidden instructions" },
      { icon: GitBranch, label: "Agent reads repository + .env secrets" },
      { icon: Terminal, label: "MCP tool executes privileged action" },
      { icon: Globe, label: "Data exfiltrated to attacker domain" },
      { icon: Ban, label: "AnveGuard blocks tool call · policy violation", tone: "ok" },
    ],
  },
  {
    id: "exfil",
    title: "Customer-data exfiltration through a chat agent",
    blastRadius: "PII · payment tokens · support transcripts",
    chain: [
      { icon: FileCode, label: "User pastes 'summarize this and email it'" },
      { icon: Database, label: "Agent queries internal CRM via tool" },
      { icon: Globe, label: "Model attempts outbound HTTP to unknown domain" },
      { icon: Ban, label: "AnveGuard denies — domain not on allowlist", tone: "ok" },
    ],
  },
  {
    id: "rogue-tool",
    title: "Compromised model invokes destructive shell",
    blastRadius: "Filesystem · DB rows · billing systems",
    chain: [
      { icon: ShieldAlert, label: "Jailbreak bypasses model safety" },
      { icon: Terminal, label: "Model calls shell.exec('rm -rf /data')" },
      { icon: Ban, label: "Tool permission layer rejects · shell not granted", tone: "ok" },
      { icon: Database, label: "Audit log captures attempt + actor + payload", tone: "ok" },
    ],
  },
];

// Tool governance — the surface area that actually matters once a model
// is compromised. AnveGuard treats every tool call as a permissioned action.
const TOOL_CONTROLS: { icon: typeof Terminal; label: string; body: string }[] = [
  { icon: Terminal, label: "Shell & code execution", body: "Allowlist commands, deny by default, capture every invocation with arguments." },
  { icon: FileCode, label: "Filesystem", body: "Scope agents to specific paths, block writes outside a sandbox, deny secret reads." },
  { icon: Globe, label: "Outbound domains", body: "Per-key egress allowlist. Block exfiltration to unknown hosts before the request leaves." },
  { icon: Database, label: "SQL & data access", body: "Read-only roles, row-level scoping, refuse DDL and bulk SELECT from agent contexts." },
  { icon: GitBranch, label: "GitHub & MCP", body: "Capability scoping for MCP servers — list which tools each key may invoke." },
  { icon: ShieldAlert, label: "Privileged actions", body: "Require step-up approval for destructive ops: deletes, transfers, role grants." },
];

// Killer end-to-end pipeline — the single diagram every non-security
// founder should be able to grok in five seconds.
const PIPELINE: { label: string; sub: string; accent?: boolean }[] = [
  { label: "User input", sub: "from your app or agent" },
  { label: "Prompt scanner", sub: "injection · PII · keyword · regex" },
  { label: "Policy engine", sub: "per-key rules · intents · severity" },
  { label: "Tool permission layer", sub: "shell · fs · net · sql · MCP", accent: true },
  { label: "LLM", sub: "OpenAI · Anthropic · Google · custom" },
  { label: "Output scanner", sub: "leak detection · response policy" },
  { label: "Audit + telemetry", sub: "immutable log · alerts · webhooks" },
];

const Landing = () => {
  const [activeSection, setActiveSection] = useState<string>("");

  // Smooth-scroll for in-page hash links (respects reduced-motion via CSS).
  const handleHashClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (!href.startsWith("#")) return;
    const id = href.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", href);
  };

  // Highlight the nav item whose section is currently in view.
  useEffect(() => {
    const elements = SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
  <div className="min-h-screen bg-background text-foreground antialiased [scroll-behavior:smooth] [&_section[id]]:scroll-mt-16">
    <Seo
      title="AnveGuard — The control layer for AI requests"
      description="Drop-in OpenAI-compatible proxy. Enforce policies, log every request, and govern AI usage across providers from a single console."
      path="/"
      jsonLd={[
        {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "AnveGuard",
          applicationCategory: "DeveloperApplication",
          applicationSubCategory: "AI gateway / LLM proxy",
          operatingSystem: "Web (Browser-based)",
          url: "https://guard.citerlabs.com",
          description: "Drop-in proxy for the OpenAI Chat Completions API. Enforce policies, capture every request, govern AI usage from a single console.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            "Drop-in OpenAI-compatible proxy",
            "Per-key policies (keyword, regex, structural)",
            "Multi-provider routing with fallbacks",
            "30-day request log with full payload",
            "Immutable admin audit log",
            "Encrypted upstream credentials (AES-GCM)",
            "Token spike alerts",
            "Streaming response forwarding",
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
      ]}
    />
    {/* ------------------------------- Top bar ------------------------------ */}
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-12 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-6 text-meta text-muted-foreground">
          {NAV.map((n) => {
            const isHash = n.href.startsWith("#");
            const isActive = isHash && activeSection === n.href.slice(1);
            return (
              <a
                key={n.href}
                href={n.href}
                onClick={(e) => handleHashClick(e, n.href)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative transition-colors hover:text-foreground",
                  isActive && "text-foreground",
                )}
              >
                {n.label}
                {isActive && (
                  <span className="absolute -bottom-[15px] left-0 right-0 h-px bg-primary" />
                )}
              </a>
            );
          })}
        </nav>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" title="AnveGuard on GitHub — Apache 2.0">
              <Github className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <Link to="/docs" title="Open the AnveGuard documentation">
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Help</span>
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/sign-up">
              Get started <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>

    <main>
    {/* --------------------------------- Hero -------------------------------- */}
    {/* Plain background, centered text, real CTA. No decorative diagram —
        the snippet section directly below carries that role. */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 pt-20 pb-14 lg:pt-28 lg:pb-20 text-center">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border surface-2 px-2.5 py-1 text-meta text-muted-foreground font-mono hover:text-foreground hover:border-primary/40 transition-colors"
          title="View the source on GitHub"
        >
          <Github className="h-3 w-3" />
          <span>Open source · Apache 2.0 · ANVE-AI/prompt-sentinel-flow</span>
          <ArrowRight className="h-3 w-3" />
        </a>
        <h1 className="mt-6 text-display lg:text-display-xl font-semibold tracking-tight leading-[1.04]">
          The control layer between<br className="hidden sm:block" /> your app and every AI model.
        </h1>
        <p className="mt-5 text-body lg:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
          AnveGuard is a drop-in proxy for the OpenAI Chat Completions API.
          Inspect every request, enforce policies before they reach a provider,
          and audit usage from a single console.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Button size="lg" asChild>
            <Link to="/sign-up">
              Start free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a
              href="#how"
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById("how");
                if (!el) return;
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                // Flash the section so users see exactly what was replayed.
                el.classList.add("ring-2", "ring-primary/60", "transition-shadow");
                window.setTimeout(() => {
                  el.classList.remove("ring-2", "ring-primary/60");
                }, 1400);
                // Surface a dismissible "Need help?" toast pointing at the
                // docs — discoverability for users who replay the quickstart
                // because they're stuck rather than curious.
                toast("Need help finishing setup?", {
                  id: "quickstart-help", // dedupe rapid re-clicks
                  description: "Full guides, API reference, and troubleshooting live in the docs.",
                  duration: 8000,
                  action: {
                    label: "Open docs",
                    onClick: () => {
                      window.location.assign("/docs");
                    },
                  },
                });
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Replay quickstart
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              <Github className="mr-2 h-4 w-4" />
              Star on GitHub
            </a>
          </Button>
        </div>
        <p className="mt-4 text-meta text-muted-foreground">
          Free tier · No credit card · 2-minute setup · Apache 2.0 ·{" "}
          <Link to="/docs" className="underline hover:text-foreground">
            Need help?
          </Link>
        </p>
      </div>

      {/* Hero product visual — animated mock of the live Threats dashboard.
          Goes between the hero copy and the stat strip so the page leads
          with text → visual → numbers, not just text → numbers. */}
      <div className="mx-auto max-w-6xl px-4 md:px-6 pb-16 lg:pb-20 -mt-2">
        <HeroProductVisual />
      </div>

      {/* Stat strip — fixed numbers, monospace values, thin top border so it
          reads as part of the hero rather than a separate band. */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <dl className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {STATS.map((s) => (
              <div key={s.label} className="px-4 md:px-6 py-5 first:pl-0 last:pr-0">
                <dt className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                  {s.label}
                </dt>
                <dd className="mt-1 text-display font-semibold tabular-nums tracking-tight">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>

    {/* ----------------------- Drop-in snippet section ---------------------- */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 lg:py-20">
        <div className="text-center mb-8">
          <div className="text-meta uppercase tracking-[0.18em] text-muted-foreground font-mono">
            Change one URL
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            No SDK. No code rewrites.
          </h2>
          <p className="mt-3 text-body text-muted-foreground max-w-xl mx-auto">
            Point any OpenAI client at AnveGuard and use an AnveGuard key.
            That's it — keep your existing libraries and patterns.
          </p>
        </div>
        <CodeTabs />
      </div>
    </section>

    {/* ----------------------- What it does (3 pillars) --------------------- */}
    <section id="product" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
            Product
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            Inspect, enforce, and audit — in one place.
          </h2>
        </div>
        <div className="mt-10 grid md:grid-cols-3 border-t border-border">
          {PILLARS.map((p, i) => (
            <div
              key={p.eyebrow}
              className={`py-7 md:py-8 md:px-7 ${i > 0 ? "border-t md:border-t-0 md:border-l border-border" : "md:pl-0"} ${i === PILLARS.length - 1 ? "md:pr-0" : ""}`}
            >
              <div className="text-meta font-mono text-muted-foreground">{p.eyebrow}</div>
              <h3 className="mt-3 text-h1 font-medium tracking-tight">{p.title}</h3>
              <p className="mt-2 text-body text-muted-foreground leading-relaxed">{p.body}</p>
              <ul className="mt-5 space-y-2">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-meta text-muted-foreground">
                    <Check className="h-3.5 w-3.5 mt-[2px] text-primary shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* --------------------- End-to-end request pipeline -------------------- */}
    {/* The "killer diagram" — every stage a request passes through, in one
        glance. Non-security founders should grok this in 5 seconds. */}
    <section id="pipeline" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
            The pipeline
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            Every request, every stage, every time.
          </h2>
          <p className="mt-3 text-body text-muted-foreground leading-relaxed">
            One pipeline runs in front of every model and every tool call. Each
            stage is independently configurable — and independently auditable.
          </p>
        </div>

        <ol className="mt-10 max-w-md mx-auto space-y-2">
          {PIPELINE.map((p, i) => (
            <li key={p.label}>
              <div
                className={cn(
                  "rounded-md border surface-1 px-4 py-3 flex items-center justify-between gap-4",
                  p.accent
                    ? "border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
                    : "border-border",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-meta font-mono text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className={cn("text-body font-medium tracking-tight", p.accent && "text-primary")}>
                      {p.label}
                    </div>
                    <div className="text-meta font-mono text-muted-foreground truncate">
                      {p.sub}
                    </div>
                  </div>
                </div>
                {p.accent && (
                  <span className="text-meta font-mono uppercase tracking-[0.12em] text-primary shrink-0">
                    most teams skip this
                  </span>
                )}
              </div>
              {i < PIPELINE.length - 1 && (
                <div className="flex justify-center py-1.5 text-muted-foreground" aria-hidden="true">
                  <ArrowDown className="h-3.5 w-3.5" />
                </div>
              )}
            </li>
          ))}
        </ol>

        <p className="mt-8 text-center text-meta text-muted-foreground max-w-xl mx-auto">
          Prompt injection isn't the real problem. The real problem is what the
          model can <span className="text-foreground font-medium">do</span> after compromise.
        </p>
      </div>
    </section>

    {/* ----------------------- Threat scenarios (attack paths) -------------- */}
    <section id="threats" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
            Threat scenarios
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            Real attack paths. Real blast radius.
          </h2>
          <p className="mt-3 text-body text-muted-foreground leading-relaxed">
            Detectors don't sell. Incidents do. Here's how AnveGuard interrupts
            three attack chains your team is already exposed to — most of which
            never touch a "prompt injection" classifier.
          </p>
        </div>

        <div className="mt-10 grid lg:grid-cols-3 gap-px bg-border border border-border">
          {THREATS.map((t) => (
            <article key={t.id} className="surface-1 p-6 flex flex-col">
              <h3 className="text-h2 font-medium tracking-tight">{t.title}</h3>
              <div className="mt-2 text-meta font-mono text-muted-foreground">
                <span className="uppercase tracking-[0.12em]">blast radius:</span>{" "}
                <span className="text-foreground">{t.blastRadius}</span>
              </div>

              <ol className="mt-5 space-y-1.5 flex-1">
                {t.chain.map((step, i) => {
                  const Icon = step.icon;
                  const isOk = step.tone === "ok";
                  return (
                    <li key={i}>
                      <div
                        className={cn(
                          "rounded-md border px-3 py-2 flex items-center gap-2.5 text-meta",
                          isOk
                            ? "border-status-ok/40 bg-status-ok/5 text-foreground"
                            : "border-border surface-2 text-muted-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isOk ? "text-status-ok" : "text-status-block",
                          )}
                          aria-hidden="true"
                        />
                        <span className={cn("font-mono leading-snug", isOk && "font-medium")}>
                          {step.label}
                        </span>
                      </div>
                      {i < t.chain.length - 1 && (
                        <div className="flex justify-center py-0.5 text-muted-foreground" aria-hidden="true">
                          <ArrowDown className="h-3 w-3" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </article>
          ))}
        </div>
      </div>
    </section>

    {/* ----------------------- Tool governance ----------------------------- */}
    <section id="tools" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          <div className="lg:col-span-5">
            <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
              Tool governance
            </div>
            <h2 className="mt-2 text-display font-semibold tracking-tight">
              Policy-controlled tool execution.
            </h2>
            <p className="mt-4 text-body text-muted-foreground leading-relaxed">
              Filters and detectors stop a fraction of the attack surface. The
              durable control is governing what an agent is <span className="text-foreground font-medium">allowed to do</span> —
              which shells, which paths, which domains, which rows.
            </p>
            <p className="mt-4 text-body text-muted-foreground leading-relaxed">
              AnveGuard treats every tool call — function call, MCP capability,
              shell command — as a permissioned action with its own allowlist,
              audit row, and override workflow.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Button size="lg" asChild>
                <Link to="/dashboard/policies#guardrails">
                  Open tool policies <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/docs/policies">How permissions evaluate</Link>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <ul className="grid sm:grid-cols-2 gap-px bg-border border border-border">
              {TOOL_CONTROLS.map((c) => {
                const Icon = c.icon;
                return (
                  <li key={c.label} className="surface-1 p-5">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border surface-2">
                        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      </span>
                      <div className="text-body font-medium tracking-tight">{c.label}</div>
                    </div>
                    <p className="mt-2 text-meta text-muted-foreground leading-relaxed">
                      {c.body}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>

    {/* ---------------------------- Quickstart ----------------------------- */}
    <section id="how" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
            Quickstart
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            Three steps. No infrastructure to manage.
          </h2>
          <p className="mt-3 text-body text-muted-foreground leading-relaxed">
            Each step links straight into the console — sign in once and you'll
            land exactly where you need to be.
          </p>
        </div>
        <ol className="mt-10 grid md:grid-cols-3 gap-px bg-border">
          {STEPS.map((s) => (
            <li key={s.n} className="surface-1 p-6 md:p-7 flex flex-col">
              <div className="text-meta font-mono text-muted-foreground">{s.n}</div>
              <div className="mt-3 text-h1 font-medium tracking-tight">{s.title}</div>
              <p className="mt-2 text-body text-muted-foreground leading-relaxed flex-1">{s.body}</p>
              <Button asChild variant="outline" size="sm" className="mt-5 w-fit">
                <Link to={s.to}>
                  {s.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </li>
          ))}
        </ol>

        {/* Inline, copy-paste-ready quickstart so visitors can finish setup
            without first opening the dashboard. Lives inside #how so the nav
            link and "Replay quickstart" CTA still land users on it. */}
        <div className="mt-10">
          <QuickstartHelpPanel variant="full" />
        </div>
      </div>
    </section>

    {/* ---------------------------- Observability --------------------------- */}
    <section id="observability" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div>
            <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
              Observability
            </div>
            <h2 className="mt-2 text-display font-semibold tracking-tight">
              Catch token spikes before they hit the bill.
            </h2>
            <p className="mt-4 text-body text-muted-foreground leading-relaxed">
              The Overview dashboard scores every anomaly window 0–100 based on how far
              <code className="mx-1 font-mono text-foreground">tokens_in</code> and
              <code className="mx-1 font-mono text-foreground">tokens_out</code> deviate
              from a rolling baseline. Calibrate baseline window, volume dampening, and
              score cap to match your traffic — no redeploys.
            </p>
            <ul className="mt-6 space-y-3">
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-5 min-w-[2rem] items-center justify-center rounded border border-border surface-2 px-1.5 text-meta font-mono tabular-nums text-muted-foreground">
                  0–39
                </span>
                <span className="text-body text-muted-foreground">
                  <span className="text-foreground font-medium">Normal.</span>{" "}
                  Within expected variance for the baseline window.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-5 min-w-[2rem] items-center justify-center rounded border border-status-warn/40 bg-status-warn/10 px-1.5 text-meta font-mono tabular-nums text-status-warn">
                  40–69
                </span>
                <span className="text-body text-muted-foreground">
                  <span className="text-foreground font-medium">Elevated.</span>{" "}
                  Sustained deviation worth a glance — usually a new workload or noisy key.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-5 min-w-[2rem] items-center justify-center rounded border border-status-err/40 bg-status-err/10 px-1.5 text-meta font-mono tabular-nums text-status-err">
                  70–100
                </span>
                <span className="text-body text-muted-foreground">
                  <span className="text-foreground font-medium">Critical.</span>{" "}
                  Banner + email notification. Likely runaway prompt loop or batch job.
                </span>
              </li>
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <Button size="lg" asChild>
                <Link to="/dashboard">
                  Open observability dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/docs/policies#severity-score">How severity is scored</Link>
              </Button>
            </div>
          </div>

          {/* Mock anomaly card — pure presentation, no live data */}
          <div className="rounded-md border border-border surface-1 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2 text-meta font-mono text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-status-err live-pulse" />
                anomaly · last 1h
              </div>
              <span className="text-meta font-mono text-muted-foreground">range: 7d</span>
            </div>
            <div className="px-4 py-5">
              <div className="flex items-baseline gap-3">
                <div className="text-display font-semibold tabular-nums tracking-tight text-status-err">
                  82
                </div>
                <div className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                  severity
                </div>
              </div>
              <p className="mt-2 text-body text-muted-foreground leading-relaxed">
                Output tokens 6.4× the 7-day average for this window.
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-px bg-border border border-border">
                <div className="surface-2 p-3">
                  <dt className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                    tokens_in / h
                  </dt>
                  <dd className="mt-1 text-h2 font-medium tabular-nums">
                    1.2k <span className="text-meta text-muted-foreground">vs 230</span>
                  </dd>
                </div>
                <div className="surface-2 p-3">
                  <dt className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                    tokens_out / h
                  </dt>
                  <dd className="mt-1 text-h2 font-medium tabular-nums">
                    9.8k <span className="text-meta text-muted-foreground">vs 1.5k</span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* -------------------------------- Quote -------------------------------- */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 lg:py-20">
        <p className="text-h1 lg:text-display font-medium tracking-tight leading-snug">
          “We replaced a homegrown logging proxy and three Notion docs of
          ‘please don't paste customer data into prompts’ with a single
          AnveGuard endpoint. Setup took an afternoon.”
        </p>
        <div className="mt-6 flex items-center gap-3 text-meta text-muted-foreground font-mono">
          <span className="h-6 w-6 rounded-full bg-primary/15 border border-primary/30" />
          <span className="text-foreground">Engineering lead</span>
          <span>·</span>
          <span>Series A SaaS, 40 engineers</span>
        </div>
      </div>
    </section>

    {/* ------------------------------ Open source --------------------------- */}
    <section id="opensource" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div>
            <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
              Open source
            </div>
            <h2 className="mt-2 text-display font-semibold tracking-tight">
              Built in the open. Apache 2.0.
            </h2>
            <p className="mt-4 text-body text-muted-foreground leading-relaxed">
              AnveGuard is open source — the proxy, the dashboard, the policy
              engine, and the 130+ attack-corpus tests all live on GitHub. Run
              the hosted service, self-host the whole stack, or fork it and make
              it yours. No telemetry, no lock-in.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { t: "Full source on GitHub", b: "TypeScript frontend, Deno edge functions, Postgres migrations — every line of it." },
                { t: "Self-hostable", b: "Bring your own Supabase + Clerk. Deploy the SPA to any static host." },
                { t: "PRs welcome", b: "63 detection rules and growing. Pick a good-first-issue and ship." },
              ].map((x) => (
                <li key={x.t} className="flex items-start gap-3">
                  <Check className="mt-1 h-4 w-4 text-primary shrink-0" />
                  <span className="text-body text-muted-foreground">
                    <span className="text-foreground font-medium">{x.t}.</span>{" "}
                    {x.b}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <Button size="lg" asChild>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <Github className="mr-2 h-4 w-4" /> View on GitHub
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a
                  href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Contribute <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          {/* Repo card — static, no GitHub API call */}
          <div className="rounded-md border border-border surface-1 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2 text-meta font-mono text-muted-foreground">
                <Github className="h-3.5 w-3.5" />
                ANVE-AI / prompt-sentinel-flow
              </div>
              <span className="text-meta font-mono text-muted-foreground">Apache 2.0</span>
            </div>
            <div className="px-4 py-5">
              <p className="text-body text-foreground leading-relaxed">
                The open-source LLM firewall. A drop-in OpenAI-compatible proxy
                that inspects, governs, and audits every call to OpenAI,
                Anthropic, Google, Perplexity, and any custom provider.
              </p>
              <dl className="mt-5 grid grid-cols-3 gap-px bg-border border border-border">
                <div className="surface-2 p-3">
                  <dt className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                    Detectors
                  </dt>
                  <dd className="mt-1 text-h2 font-medium tabular-nums">63</dd>
                </div>
                <div className="surface-2 p-3">
                  <dt className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                    Tests
                  </dt>
                  <dd className="mt-1 text-h2 font-medium tabular-nums">130+</dd>
                </div>
                <div className="surface-2 p-3">
                  <dt className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                    License
                  </dt>
                  <dd className="mt-1 text-h2 font-medium">Apache 2.0</dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2 text-meta font-mono text-muted-foreground">
                {["typescript", "deno", "supabase", "react", "vite", "tailwind"].map((t) => (
                  <span key={t} className="rounded-full border border-border surface-2 px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* --------------------------------- FAQ -------------------------------- */}
    <section id="faq" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 lg:py-20">
        <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
          FAQ
        </div>
        <h2 className="mt-2 text-display font-semibold tracking-tight">
          Common questions.
        </h2>
        <dl className="mt-10 divide-y divide-border border-y border-border">
          {FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="text-h2 font-medium tracking-tight">{f.q}</dt>
              <dd className="mt-2 text-body text-muted-foreground leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>

    {/* --------------------------------- CTA -------------------------------- */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-20 text-center">
        <h2 className="text-display lg:text-display-lg font-semibold tracking-tight">
          Ship AI features with a control layer from day one.
        </h2>
        <p className="mt-3 text-body text-muted-foreground">
          Free to start. Open source forever. Self-host any time.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Button size="lg" asChild>
            <Link to="/sign-up">
              Create your first key <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              <Github className="mr-2 h-4 w-4" /> Star on GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>
    </main>

    {/* ------------------------------- Footer ------------------------------- */}
    <footer>
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-4 flex flex-col sm:flex-row items-center sm:justify-between gap-2 text-meta text-muted-foreground">
        <div className="flex items-center gap-3">
          <Logo size={20} />
          <span>© {new Date().getFullYear()} AnveGuard · Apache 2.0</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Github className="h-3.5 w-3.5" /> GitHub
          </a>
          <Link to="/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-status-ok live-pulse" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  </div>
  );
};

export default Landing;
