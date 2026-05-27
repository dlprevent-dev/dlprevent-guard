import { Link } from "react-router-dom";
import { ArrowRight, ShieldAlert, Check, AlertTriangle } from "lucide-react";
import { Seo } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing-shell";
import { DocPage, H2, P, Lead, UL, Callout, CrumbLink } from "@/pages/docs/DocsLayout";

/**
 * /mcp — content wedge for MCP security. Not a marketing fluff page —
 * this is the substance that earns links from infra-security people:
 * concrete threat model, concrete hardening checklist, concrete mapping
 * to AnveGuard primitives.
 */

const HARDENING: { title: string; body: string }[] = [
  { title: "Capability allowlists per key",       body: "Default-deny every MCP tool. Add only the capability names a given key actually needs. Treat tool lists like IAM roles." },
  { title: "Pin tool descriptions",                body: "Hash and pin the description string at install time. Refuse to expose a tool to the model when the description drifts." },
  { title: "Egress allowlist for tool calls",      body: "Every outbound HTTP from a tool resolves through a named allowlist. Wildcard domains are an anti-pattern." },
  { title: "Strict schema validation",             body: "Validate every tool argument against a JSON Schema before invocation. Reject silently-coerced types." },
  { title: "Quarantine retrieved content",         body: "Treat tool-result text, file contents, and URLs as untrusted. Run the same prompt scanner you run on user input." },
  { title: "Block cross-tool reference",           body: "Refuse calls that name another tool the model wasn't given. Cross-server shadowing is the new SSRF." },
  { title: "Rate + token caps per tool",           body: "Cap invocations per minute and tokens per invocation. Most exfiltration paths need volume to be useful." },
  { title: "Step-up approval for destructive ops", body: "Deletes, transfers, role grants, payment writes: gate behind a human in the loop, not a model decision." },
  { title: "Append-only audit per call",           body: "Persist actor + tool + arguments + verdict for every invocation. Immutable. Indexed by actor and resource." },
  { title: "Kill switch per server",               body: "One-click disable any registered MCP server. Reversible only with a different actor." },
];

const THREATS: { title: string; body: string }[] = [
  { title: "Untrusted tool descriptions",          body: "MCP descriptions ride into the model context. A compromised server can embed instructions there that the model will follow before any user input arrives." },
  { title: "Tool shadowing",                       body: "Two servers expose tools with overlapping names. The model picks the wrong one. Variant of cross-server reference; mitigated by namespacing + cross-tool refusal." },
  { title: "Prompt injection via tool results",    body: "A scraped HTML page, a GitHub issue, a CRM note returns text that says 'now do X'. Same OWASP LLM01 category, different blast radius (the agent already has tools)." },
  { title: "Capability creep",                     body: "Servers add new tools in updates. Without pinning, your agent silently gains powers it never had at install time." },
  { title: "Markdown / image exfiltration",        body: "Models emit markdown that the client renders, triggering an outbound image load to an attacker-controlled domain — encoding the secret in the URL (EchoLeak, CVE-2025-32711)." },
  { title: "Risk-trio composition",                body: "Untrusted input × outbound channel × privileged context. Any single leg is fine; the combination is the agentic exfiltration shape we observed in 2024–25." },
];

const Mcp = () => (
  <MarketingShell>
    <Seo
      title="MCP security — runtime governance for agent tools"
      description="MCP threat model, hardening checklist, and how AnveGuard governs every capability your agent can invoke."
      path="/mcp"
      type="article"
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: "MCP security — runtime governance for agent tools",
        description: "MCP threat model and hardening checklist. How AnveGuard governs every capability your agent can invoke.",
        url: "https://guard.citerlabs.com/mcp",
        inLanguage: "en",
        about: ["Model Context Protocol", "AI agent security", "Tool governance"],
        isPartOf: { "@type": "WebSite", name: "AnveGuard", url: "https://guard.citerlabs.com/" },
        publisher: { "@type": "Organization", name: "AnveGuard", url: "https://guard.citerlabs.com/" },
      }}
    />

    {/* Hero */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 pt-16 pb-12 lg:pt-24 lg:pb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-border surface-2 px-2.5 py-1 text-meta text-muted-foreground font-mono">
          <ShieldAlert className="h-3 w-3 text-primary" /> MCP · runtime governance
        </div>
        <h1 className="mt-5 text-display lg:text-display-lg font-semibold tracking-tight leading-[1.05]">
          MCP security, before MCP eats production.
        </h1>
        <p className="mt-5 text-body lg:text-base text-muted-foreground leading-relaxed">
          MCP turned every model into an agent with hands. The problem isn't
          the protocol — it's that <span className="text-foreground">capability sprawl</span>{" "}
          arrived before the controls did. This page is the threat model, the
          hardening checklist, and the mapping to AnveGuard primitives.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <Button size="lg" asChild>
            <Link to="/sign-up">
              Govern your MCP servers <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/research/top-10-mcp-vulnerabilities">Read the Top 10</Link>
          </Button>
        </div>
      </div>
    </section>

    {/* Threat model */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-14 lg:py-20">
        <DocPage
          eyebrow="01 · Threat model"
          title="What goes wrong with MCP"
          lede="Six attack shapes that AnveGuard sees in the wild. The first three are protocol-native; the rest are emergent."
        >
          <Lead>
            Every MCP attack collapses into one of these. Pattern-match incidents
            into this list, then check your controls against the hardening
            checklist below.
          </Lead>

          <UL>
            {THREATS.map((t) => (
              <li key={t.title}>
                <strong>{t.title}.</strong> {t.body}
              </li>
            ))}
          </UL>

          <Callout kind="warn" title="The shape we see most">
            <p>
              <strong>Prompt injection via tool result.</strong> A user asks the
              agent something innocuous; a tool returns scraped text containing
              hidden instructions; the model treats the instructions as its
              user. Two of three production breaches we've debugged in 2025
              were this exact shape.
            </p>
          </Callout>

          <H2 id="risk-trio">The risk-trio composition</H2>
          <P>
            Any single one of these is benign. The combination is the agentic
            exfiltration shape:
          </P>
          <UL>
            <li><strong>Untrusted input</strong> — RAG chunk, MCP tool result, scraped HTML, email body.</li>
            <li><strong>Outbound channel</strong> — net.fetch, markdown image, email send, webhook tool.</li>
            <li><strong>Privileged context</strong> — workspace secrets, customer PII, code, audit logs.</li>
          </UL>
          <P>
            AnveGuard's risk-trio detector fires when all three appear in one
            request. Most prompt-injection classifiers miss this because each
            leg is fine in isolation.
          </P>
        </DocPage>
      </div>
    </section>

    {/* Hardening */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-14 lg:py-20">
        <div className="max-w-2xl">
          <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
            02 · Hardening checklist
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            Ten controls. No fluff.
          </h2>
          <p className="mt-3 text-body text-muted-foreground leading-relaxed">
            Copy this list. Walk every MCP server you have through it.
            If you can't tick a row, you have a gap. AnveGuard handles seven
            of them out of the box; the other three are operational.
          </p>
        </div>

        <ol className="mt-10 grid md:grid-cols-2 gap-px bg-border border border-border">
          {HARDENING.map((h, i) => (
            <li key={h.title} className="surface-1 p-5 flex gap-3">
              <span className="font-mono text-meta text-muted-foreground tabular-nums shrink-0 w-6">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-status-ok shrink-0" aria-hidden />
                  <span className="text-body font-medium tracking-tight">{h.title}</span>
                </div>
                <p className="mt-1.5 text-meta text-muted-foreground leading-relaxed">{h.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>

    {/* AnveGuard mapping */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-14 lg:py-20">
        <div className="max-w-2xl">
          <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
            03 · AnveGuard for MCP
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            Which primitive does the work.
          </h2>
        </div>

        <div className="mt-10 grid md:grid-cols-3 gap-px bg-border border border-border">
          {[
            {
              eyebrow: "Policy engine",
              title: "Untrusted tool-result text gets scanned.",
              body: "Every chunk a tool returns runs through evaluateRetrieved() — 9 channel-aware detectors for XPIA, hidden HTML, markdown image exfil, SQL-write in NL→SQL context, dangerous Python in code-gen retrieval, and cross-tool shadowing.",
              cta: "Open policies",
              to: "/dashboard/policies",
            },
            {
              eyebrow: "Tool permission layer",
              title: "Capabilities are scoped per key.",
              body: "Default-deny. Each AnveGuard key declares which MCP tools, shell commands, filesystem paths, and outbound domains it may invoke. Schema-validated before exec, denied above the model layer.",
              cta: "Open tool policies",
              to: "/dashboard/policies#guardrails",
            },
            {
              eyebrow: "Audit + telemetry",
              title: "Every invocation is permanent.",
              body: "Actor, tool, arguments, verdict, payload — written to an immutable log indexed by actor and resource. Token-spike alerts surface anomalies before they hit the bill or the press.",
              cta: "Open audit",
              to: "/dashboard/logs",
            },
          ].map((p, i) => (
            <div key={i} className="surface-1 p-6">
              <div className="text-meta font-mono text-muted-foreground">{p.eyebrow}</div>
              <h3 className="mt-3 text-h1 font-medium tracking-tight">{p.title}</h3>
              <p className="mt-2 text-body text-muted-foreground leading-relaxed">{p.body}</p>
              <Button asChild variant="outline" size="sm" className="mt-5">
                <Link to={p.to}>{p.cta} <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section>
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 text-meta font-mono text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-status-warn" />
          MCP attack surface is growing weekly
        </div>
        <h2 className="mt-3 text-display font-semibold tracking-tight">
          Govern every tool before you ship the next one.
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Button size="lg" asChild>
            <Link to="/sign-up">Start free <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/research">Read more research</Link>
          </Button>
        </div>
        <p className="mt-6 text-meta text-muted-foreground">
          Background reading: <CrumbLink to="/docs/policies">policies</CrumbLink> ·
          <CrumbLink to="/docs/concepts"> concepts</CrumbLink>
        </p>
      </div>
    </section>
  </MarketingShell>
);

export default Mcp;
