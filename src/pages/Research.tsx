import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Seo } from "@/components/seo";
import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";

/**
 * /research — content hub index. Plain list, no card noise. Each post
 * is a TSX page under src/pages/research/* using DocsLayout primitives.
 */

export interface ResearchPost {
  slug: string;
  title: string;
  dek: string;
  date: string; // ISO
  readMinutes: number;
  tag: string;
}

export const POSTS: ResearchPost[] = [
  {
    slug: "runtime-governance-for-ai",
    title: "Runtime governance is the next category in AI infrastructure.",
    dek: "Prompt filtering commoditizes. The durable layer is the runtime — what an agent is allowed to do, to whom, with which budget, audited where. A category-defining essay.",
    date: "2026-05-26",
    readMinutes: 9,
    tag: "Strategy",
  },
  {
    slug: "top-10-mcp-vulnerabilities",
    title: "Top 10 MCP vulnerabilities (and how to actually mitigate them).",
    dek: "A practitioner's threat list for Model Context Protocol deployments: tool shadowing, capability creep, prompt injection via tool results, markdown image exfiltration, and six more. Mapped to OWASP MCP Top 10.",
    date: "2026-05-22",
    readMinutes: 12,
    tag: "MCP",
  },
  {
    slug: "how-ai-agents-leak-secrets",
    title: "How AI agents leak secrets — six exfiltration shapes we keep seeing.",
    dek: "Markdown image beacons, tool-result echoes, error-message smuggling, eager logging, model-as-courier, and the risk-trio composition. With concrete repro and detector mappings.",
    date: "2026-05-18",
    readMinutes: 10,
    tag: "Threats",
  },
];

const Research = () => (
  <MarketingShell>
    <Seo
      title="Research — AnveGuard"
      description="Original research on AI security, MCP threats, agent exfiltration, and the runtime governance category."
      path="/research"
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "AnveGuard Research",
        url: "https://guard.citerlabs.com/research",
        description: "Original research on AI security, MCP threats, agent exfiltration, and runtime governance.",
        publisher: { "@type": "Organization", name: "AnveGuard", url: "https://guard.citerlabs.com/" },
        blogPost: POSTS.map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          datePublished: p.date,
          url: `https://guard.citerlabs.com/research/${p.slug}`,
          description: p.dek,
        })),
      }}
    />

    {/* Hero */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 pt-16 pb-10 lg:pt-24 lg:pb-14">
        <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
          Research
        </div>
        <h1 className="mt-3 text-display lg:text-display-lg font-semibold tracking-tight leading-[1.05]">
          Original research on AI security and runtime governance.
        </h1>
        <p className="mt-5 text-body text-muted-foreground leading-relaxed max-w-2xl">
          Threat models, attack write-ups, and strategic essays from the team
          building AnveGuard. Citable. Linkable. Apache-2.0 like the code.
        </p>
      </div>
    </section>

    {/* Post list */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-12 lg:py-16">
        <ol className="divide-y divide-border border-y border-border">
          {POSTS.map((p) => (
            <li key={p.slug}>
              <Link
                to={`/research/${p.slug}`}
                className="group block py-7 transition-colors hover:bg-surface-1/60 -mx-4 px-4 md:-mx-6 md:px-6"
              >
                <div className="flex items-center gap-3 text-meta font-mono text-muted-foreground">
                  <span className="uppercase tracking-[0.14em] text-primary">{p.tag}</span>
                  <span>·</span>
                  <time dateTime={p.date}>
                    {new Date(p.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </time>
                  <span>·</span>
                  <span>{p.readMinutes} min read</span>
                </div>
                <h2 className="mt-2 text-h1 font-medium tracking-tight group-hover:text-primary transition-colors">
                  {p.title}
                </h2>
                <p className="mt-2 text-body text-muted-foreground leading-relaxed max-w-2xl">
                  {p.dek}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-meta font-mono text-muted-foreground group-hover:text-foreground">
                  Read <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>

    {/* CTA */}
    <section>
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 text-center">
        <h2 className="text-display font-semibold tracking-tight">
          Get the runtime governance layer your research describes.
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Button size="lg" asChild>
            <Link to="/sign-up">Start free <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/mcp">Read the MCP brief</Link>
          </Button>
        </div>
      </div>
    </section>
  </MarketingShell>
);

export default Research;
