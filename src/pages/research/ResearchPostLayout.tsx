import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Seo } from "@/components/seo";
import { MarketingShell } from "@/components/marketing-shell";
import { DocPage } from "@/pages/docs/DocsLayout";
import { Button } from "@/components/ui/button";

/**
 * Chrome for a single /research/<slug> post. Uses MarketingShell for top/bottom,
 * DocPage for typography. Adds Article JSON-LD + Back-to-Research link.
 */

export interface ResearchPostChrome {
  slug: string;
  title: string;
  dek: string;
  date: string;
  readMinutes: number;
  tag: string;
}

export const ResearchPostLayout = ({
  post,
  children,
}: {
  post: ResearchPostChrome;
  children: ReactNode;
}) => {
  const url = `https://guard.citerlabs.com/research/${post.slug}`;
  return (
    <MarketingShell>
      <Seo
        title={`${post.title} — AnveGuard Research`}
        description={post.dek}
        path={`/research/${post.slug}`}
        type="article"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          description: post.dek,
          url,
          inLanguage: "en",
          datePublished: post.date,
          dateModified: post.date,
          author: { "@type": "Organization", name: "AnveGuard Research", url: "https://guard.citerlabs.com/research" },
          publisher: { "@type": "Organization", name: "AnveGuard", url: "https://guard.citerlabs.com/" },
          isPartOf: { "@type": "Blog", name: "AnveGuard Research", url: "https://guard.citerlabs.com/research" },
        }}
      />

      <article className="mx-auto max-w-3xl px-4 md:px-6 pt-10 lg:pt-14 pb-16 lg:pb-20">
        <Link
          to="/research"
          className="inline-flex items-center gap-1 text-meta font-mono text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Research
        </Link>

        <div className="mt-6 flex items-center gap-3 text-meta font-mono text-muted-foreground">
          <span className="uppercase tracking-[0.14em] text-primary">{post.tag}</span>
          <span>·</span>
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
          </time>
          <span>·</span>
          <span>{post.readMinutes} min read</span>
        </div>

        <DocPage eyebrow="AnveGuard Research" title={post.title} lede={post.dek}>
          {children}
        </DocPage>

        <div className="mt-14 border-t border-border pt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="text-meta text-muted-foreground">
            Found a mistake or want to cite this?{" "}
            <a
              href="https://github.com/ANVE-AI/prompt-sentinel-flow"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Open an issue
            </a>
            .
          </div>
          <Button asChild size="sm">
            <Link to="/sign-up">
              Try AnveGuard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </article>
    </MarketingShell>
  );
};

export default ResearchPostLayout;
