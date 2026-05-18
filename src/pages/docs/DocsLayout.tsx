import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ChevronRight, Search, ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Seo } from "@/components/seo";
import { cn } from "@/lib/utils";

const DOC_META: Record<string, { title: string; description: string }> = {
  "/docs": {
    title: "AnveGuard Docs — OpenAI-compatible AI proxy",
    description: "Introduction to AnveGuard: inspect, govern, and audit every LLM call your team makes without changing application code.",
  },
  "/docs/quickstart": {
    title: "Quickstart — AnveGuard Docs",
    description: "Send your first request through AnveGuard in under five minutes by changing one base URL in your existing OpenAI SDK.",
  },
  "/docs/concepts": {
    title: "Concepts — AnveGuard Docs",
    description: "Core model of AnveGuard: keys, endpoints, providers, routes, policies, and the immutable audit log.",
  },
  "/docs/api-keys": {
    title: "API keys — AnveGuard Docs",
    description: "Create, scope, rotate, and revoke AnveGuard API keys, and attach per-key policies and rate limits.",
  },
  "/docs/endpoints": {
    title: "Endpoints & providers — AnveGuard Docs",
    description: "Configure upstream OpenAI-compatible providers and the public endpoints your application calls.",
  },
  "/docs/routes": {
    title: "Routes & fallbacks — AnveGuard Docs",
    description: "Map model aliases to providers and define automatic fallback chains for resilient AI traffic.",
  },
  "/docs/policies": {
    title: "Policies — AnveGuard Docs",
    description: "Author keyword, regex, and structural policies that block, warn, or redact requests before they leave your network.",
  },
  "/docs/logs": {
    title: "Logs & audit — AnveGuard Docs",
    description: "Search every request, response, and admin action with full payload, actor, and timestamp.",
  },
  "/docs/proxy-api": {
    title: "Proxy API reference — AnveGuard Docs",
    description: "Full reference for AnveGuard's OpenAI-compatible /v1/chat/completions endpoint, including headers and streaming.",
  },
  "/docs/errors": {
    title: "Errors — AnveGuard Docs",
    description: "Error codes returned by the AnveGuard proxy, what they mean, and how your application should handle them.",
  },
  "/docs/faq": {
    title: "FAQ — AnveGuard Docs",
    description: "Common operator questions about AnveGuard: latency, providers, on-prem deployment, pricing, and security.",
  },
};


/**
 * YC-style docs shell.
 *
 * Layout:
 *   - Slim top bar with brand + global search + "Back to app".
 *   - Left rail: section ToC (sticky, full-height).
 *   - Center: prose column, max-w-3xl, generous line-height.
 *   - Right rail (xl+): in-page H2 anchors that highlight on scroll.
 *
 * No hero gradients, no decorative shadows. Mono labels, thin 1px borders,
 * single accent color — same vocabulary as the landing page.
 */

export type DocLink = { to: string; label: string; eyebrow?: string };
export type DocSection = { id: string; label: string; items: DocLink[] };

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "intro",
    label: "Introduction",
    items: [
      { to: "/docs", label: "Overview", eyebrow: "01" },
      { to: "/docs/quickstart", label: "Quickstart", eyebrow: "02" },
      { to: "/docs/concepts", label: "Concepts", eyebrow: "03" },
    ],
  },
  {
    id: "guides",
    label: "Guides",
    items: [
      { to: "/docs/api-keys", label: "API keys", eyebrow: "04" },
      { to: "/docs/endpoints", label: "Endpoints & providers", eyebrow: "05" },
      { to: "/docs/routes", label: "Routes & fallbacks", eyebrow: "06" },
      { to: "/docs/policies", label: "Policies", eyebrow: "07" },
      { to: "/docs/logs", label: "Logs & audit", eyebrow: "08" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    items: [
      { to: "/docs/proxy-api", label: "Proxy API", eyebrow: "09" },
      { to: "/docs/errors", label: "Errors", eyebrow: "10" },
      { to: "/docs/faq", label: "FAQ", eyebrow: "11" },
    ],
  },
];

const FLAT_LINKS = DOC_SECTIONS.flatMap((s) => s.items);

const DocsLayout = () => {
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Reset scroll + close mobile nav on route change.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMobileNavOpen(false);
  }, [pathname]);

  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return FLAT_LINKS.filter((l) => l.label.toLowerCase().includes(q));
  }, [query]);

  const idx = FLAT_LINKS.findIndex((l) => l.to === pathname);
  const prev = idx > 0 ? FLAT_LINKS[idx - 1] : null;
  const next = idx >= 0 && idx < FLAT_LINKS.length - 1 ? FLAT_LINKS[idx + 1] : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 h-12 border-b border-border bg-background/85 backdrop-blur">
        <div className="h-full max-w-[1400px] mx-auto px-4 md:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              className="lg:hidden inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-muted-foreground hover:text-foreground"
              aria-label="Toggle navigation"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <Logo to="/" />
            <span className="hidden sm:inline text-muted-foreground/60">/</span>
            <Link to="/docs" className="hidden sm:inline text-body font-medium hover:text-foreground">
              Docs
            </Link>
          </div>

          <div className="relative hidden md:block w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search docs…"
              className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-surface-2 text-meta placeholder:text-muted-foreground/60 focus:outline-none focus:border-border-strong"
            />
            {filtered && filtered.length > 0 && (
              <div className="absolute z-40 mt-1 w-full rounded-md border border-border surface-1 shadow-md py-1">
                {filtered.slice(0, 8).map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setQuery("")}
                    className="block px-3 py-1.5 text-meta hover:bg-sidebar-accent"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-meta text-muted-foreground hover:text-foreground"
            >
              Open app <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-[1400px] w-full mx-auto px-4 md:px-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_200px] gap-8">
        {/* Left rail */}
        <aside
          className={cn(
            "lg:sticky lg:top-12 lg:self-start lg:h-[calc(100vh-3rem)] py-6 lg:overflow-y-auto",
            mobileNavOpen ? "block" : "hidden lg:block",
          )}
        >
          <nav className="space-y-6">
            {DOC_SECTIONS.map((section) => (
              <div key={section.id}>
                <div className="px-2 mb-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium font-mono">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/docs"}
                      className={({ isActive }) =>
                        cn(
                          "relative flex items-center gap-2 rounded-md pl-3 pr-2 h-8 text-body transition-colors",
                          isActive
                            ? "text-foreground bg-sidebar-accent"
                            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            aria-hidden
                            className={cn(
                              "absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full",
                              isActive ? "opacity-100 bg-primary" : "opacity-0",
                            )}
                          />
                          {item.eyebrow && (
                            <span className="font-mono text-[10px] text-muted-foreground/60 w-5">
                              {item.eyebrow}
                            </span>
                          )}
                          <span className="font-medium">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Center */}
        <main className="min-w-0 py-8 lg:py-10">
          <article className="max-w-3xl">
            <Outlet />

            {(prev || next) && (
              <div className="mt-16 pt-6 border-t border-border grid grid-cols-2 gap-3">
                {prev ? (
                  <Link
                    to={prev.to}
                    className="group rounded-md border border-border surface-1 p-3 hover:border-border-strong transition-colors"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                      ← Previous
                    </div>
                    <div className="text-body font-medium mt-1 group-hover:text-primary">
                      {prev.label}
                    </div>
                  </Link>
                ) : (
                  <div />
                )}
                {next ? (
                  <Link
                    to={next.to}
                    className="group rounded-md border border-border surface-1 p-3 text-right hover:border-border-strong transition-colors"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                      Next →
                    </div>
                    <div className="text-body font-medium mt-1 group-hover:text-primary">
                      {next.label}
                    </div>
                  </Link>
                ) : (
                  <div />
                )}
              </div>
            )}

            <DocsFooter />
          </article>
        </main>

        {/* Right rail (in-page anchors) */}
        <aside className="hidden xl:block sticky top-12 self-start h-[calc(100vh-3rem)] py-10 overflow-y-auto">
          <OnThisPage key={pathname} />
        </aside>
      </div>
    </div>
  );
};

/**
 * Scrapes h2[id] from the rendered article and lists them as anchored links.
 * Highlights the closest one to the top of the viewport.
 */
function OnThisPage() {
  const [headings, setHeadings] = useState<{ id: string; text: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const collect = () => {
      const nodes = Array.from(document.querySelectorAll("article h2[id]")) as HTMLHeadingElement[];
      setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent ?? "" })));
    };
    // Run after Outlet renders.
    const t = setTimeout(collect, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!headings.length) return;
    const onScroll = () => {
      const fromTop = 100;
      let current: string | null = null;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - fromTop <= 0) current = h.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-mono mb-2">
        On this page
      </div>
      <ul className="space-y-1.5 text-meta">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "block border-l-2 pl-3 py-0.5 transition-colors",
                active === h.id
                  ? "border-primary text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocsFooter() {
  return (
    <footer className="mt-16 pt-6 border-t border-border flex flex-wrap items-center justify-between gap-3 text-meta text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-status-ok" /> All systems operational
      </div>
      <div className="flex items-center gap-4">
        <Link to="/" className="hover:text-foreground">Home</Link>
        <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <a href="https://github.com" className="hover:text-foreground inline-flex items-center gap-1">
          GitHub <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </footer>
  );
}

// ===== Reusable doc primitives — exported so each page renders consistently =====

export function DocPage({ eyebrow, title, lede, children }: { eyebrow: string; title: string; lede?: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary mb-3">
        {eyebrow}
      </div>
      <h1 className="text-display tracking-tight font-medium">{title}</h1>
      {lede && <p className="mt-3 text-[1.0625rem] leading-7 text-muted-foreground">{lede}</p>}
      <div className="mt-8 docs-prose">{children}</div>
    </div>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-h1 font-medium mt-12 mb-3 tracking-tight">
      <a href={`#${id}`} className="group inline-flex items-baseline gap-2">
        {children}
        <span className="opacity-0 group-hover:opacity-100 text-muted-foreground font-mono text-[12px]">#</span>
      </a>
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-h2 font-medium mt-8 mb-2">{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-body leading-7 text-foreground/90 mb-4">{children}</p>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[1rem] leading-7 text-muted-foreground mb-6">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1.5 text-body text-foreground/90 mb-4 marker:text-muted-foreground">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-1.5 text-body text-foreground/90 mb-4 marker:text-muted-foreground">{children}</ol>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[12.5px] px-1.5 py-0.5 rounded border border-border bg-surface-2 text-foreground">
      {children}
    </code>
  );
}

export function Pre({ language, children }: { language?: string; children: string }) {
  return (
    <div className="my-5 rounded-md border border-border surface-2 overflow-hidden">
      {language && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{language}</span>
        </div>
      )}
      <pre className="px-4 py-3 overflow-x-auto text-meta leading-6 font-mono text-foreground/90">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Callout({ kind = "note", title, children }: { kind?: "note" | "warn" | "tip"; title?: string; children: ReactNode }) {
  const styles =
    kind === "warn"
      ? "border-destructive/30 bg-destructive/5"
      : kind === "tip"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-border surface-2";
  const label = title ?? (kind === "warn" ? "Heads up" : kind === "tip" ? "Tip" : "Note");
  return (
    <div className={cn("my-5 rounded-md border p-4", styles)}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-body leading-7 text-foreground/90">{children}</div>
    </div>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="my-6 space-y-5 counter-reset-step">{children}</ol>;
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-3">
      <div className="h-7 w-7 rounded-md border border-border surface-2 flex items-center justify-center font-mono text-meta text-muted-foreground">
        {n}
      </div>
      <div>
        <div className="text-h2 font-medium">{title}</div>
        <div className="mt-1.5 text-body leading-7 text-foreground/90">{children}</div>
      </div>
    </li>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-meta">
        <thead className="surface-2 border-b border-border">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left font-medium px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top text-foreground/90">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CrumbLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-primary hover:underline inline-flex items-center gap-0.5">
      {children}
      <ChevronRight className="h-3 w-3" />
    </Link>
  );
}

export default DocsLayout;
