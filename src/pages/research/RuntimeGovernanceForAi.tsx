import { H2, P, UL, Pre, Callout, CrumbLink } from "@/pages/docs/DocsLayout";
import { ResearchPostLayout } from "./ResearchPostLayout";

const post = {
  slug: "runtime-governance-for-ai",
  title: "Runtime governance is the next category in AI infrastructure.",
  dek: "Prompt filtering commoditizes. The durable layer is the runtime — what an agent is allowed to do, to whom, with which budget, audited where.",
  date: "2026-05-26",
  readMinutes: 9,
  tag: "Strategy",
};

const RuntimeGovernanceForAi = () => (
  <ResearchPostLayout post={post}>
    <P>
      The first wave of AI security was about <em>what models say</em>. The
      second is about <em>what models do</em>. We're in the second wave now,
      and the winners look less like content-moderation vendors and more like
      Cloudflare, Vault, and IAM consoles — operational layers that survive
      because they govern <strong>runtime</strong>, not output.
    </P>

    <H2 id="thesis">The thesis in one paragraph</H2>
    <P>
      Prompt detection commoditizes. Anyone with a weekend and a corpus can
      ship a "jailbreak classifier" — and that floor will keep dropping as
      base models get better at refusing on their own. The durable category
      isn't <em>"did the prompt look bad?"</em> It's <em>"is this agent
      allowed to do this thing, to this resource, with this budget, and is
      it written down forever?"</em> That's runtime governance. It's a
      different surface area, and it's where the moat lives.
    </P>

    <H2 id="cloudflare-analogy">The Cloudflare analogy</H2>
    <P>
      Cloudflare didn't win because it had the best WAF rules — many vendors
      had comparable rules. It won because it sat in the request path. Once
      a layer terminates traffic, it accretes everything else: caching, bot
      detection, rate limits, analytics, access policy, edge compute. The
      hard part is being in the path; the easy part is owning categories
      from there.
    </P>
    <P>
      AI traffic needs the same layer. Today every team rolls their own:
      one wrapper around the OpenAI SDK, another around Anthropic, a
      home-grown logger, a Notion doc full of "please don't paste customer
      data into prompts." That is the pre-Cloudflare era for AI.
    </P>

    <H2 id="surface-area">What runtime governance actually covers</H2>
    <P>
      A complete runtime control plane handles seven concerns. Most products
      today handle one or two and call it a category.
    </P>
    <UL>
      <li><strong>Identity.</strong> Per-key, per-agent, per-tenant credentials with rotation and revocation.</li>
      <li><strong>Routing.</strong> Alias mapping, fallback chains, regional pinning, model swap without redeploy.</li>
      <li><strong>Policy.</strong> Input + output scanners, intent classification, structural rules — applied per key.</li>
      <li><strong>Tool governance.</strong> Default-deny capability lists, schema-validated arguments, egress allowlists.</li>
      <li><strong>Spend.</strong> Token caps, anomaly scoring, calibrated alerts before the bill arrives.</li>
      <li><strong>Audit.</strong> Immutable, indexed-by-actor, exportable. Compliance teams will eventually demand this.</li>
      <li><strong>Compliance.</strong> Data-residency, redaction at the proxy, retention controls, SOC 2 / HIPAA / EU AI Act mappings.</li>
    </UL>

    <H2 id="why-now">Why the timing matters</H2>
    <P>
      Three trends collided in 2025: MCP made every model an agent with hands,
      browser-use agents put models on the public internet with credentials,
      and the EU AI Act + US executive orders made "I have no record of what
      my AI did" a board-level problem. The product category is open. By
      2027 it won't be.
    </P>

    <Callout kind="tip" title="The pattern to bet on">
      <p>
        Any infra category that <strong>terminates the request path</strong>
        becomes the integration point for everything downstream. Email
        gateway → DLP. CDN → WAF. Identity provider → SSO. AI proxy →
        runtime governance. The shape is well-trodden.
      </p>
    </Callout>

    <H2 id="moat">What the moat looks like</H2>
    <UL>
      <li><strong>Coverage.</strong> Every provider, every modality, every tool surface — without that, you're not in the path for enough traffic to matter.</li>
      <li><strong>Telemetry depth.</strong> Once you have years of grounded traces, you can ship detectors no one else can — and price on outcomes.</li>
      <li><strong>Workflows.</strong> Policy approval flows, on-call escalation, audit exports, change management. Boring. Sticky.</li>
      <li><strong>Open source distribution.</strong> The proxy is the wedge. Self-host or hosted; both feed the same control plane.</li>
    </UL>

    <H2 id="what-loses">What loses</H2>
    <P>
      Three categories will compress hard over the next 24 months:
    </P>
    <UL>
      <li><strong>Standalone jailbreak classifiers.</strong> Base models get this for free.</li>
      <li><strong>"AI observability" as a SaaS line item</strong> with no enforcement. Logs without policy are post-mortems.</li>
      <li><strong>Per-provider wrappers.</strong> If you only proxy OpenAI, you're a feature, not a category.</li>
    </UL>

    <H2 id="anveguard">Where AnveGuard sits</H2>
    <P>
      AnveGuard is in the path. OpenAI-compatible, multi-provider, encrypted
      upstream credentials, per-key policy, default-deny tool layer,
      immutable audit. Open source under Apache 2.0 so the wedge can spread
      without a sales cycle. The hosted service runs the same code; the
      enterprise control plane is built on top.
    </P>
    <P>
      If the category framing in this essay is right, the product looks
      obvious in retrospect. If the framing is wrong, we'll have written
      it down somewhere everyone can find it.
    </P>

    <Pre language="text">{`User input
   ↓
Prompt scanner
   ↓
Policy engine          ← per-key, per-tenant
   ↓
Tool permission layer  ← default-deny, schema-validated
   ↓
LLM
   ↓
Output scanner
   ↓
Audit + telemetry      ← immutable, indexed, exportable`}</Pre>

    <P>
      Related reading: <CrumbLink to="/research/top-10-mcp-vulnerabilities">Top 10 MCP vulnerabilities</CrumbLink>, <CrumbLink to="/research/how-ai-agents-leak-secrets">How AI agents leak secrets</CrumbLink>, <CrumbLink to="/mcp">MCP security overview</CrumbLink>.
    </P>
  </ResearchPostLayout>
);

export default RuntimeGovernanceForAi;
