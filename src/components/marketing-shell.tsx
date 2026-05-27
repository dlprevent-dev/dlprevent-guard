import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Github } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const GITHUB_URL = "https://github.com/ANVE-AI/prompt-sentinel-flow";

/**
 * Shared chrome for top-level marketing/research pages (/mcp, /research, etc.)
 * Keeps a slim landing-style header + a quiet footer, so the pages feel
 * native to the marketing site rather than to /docs or /dashboard.
 */
export const MarketingShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-background text-foreground antialiased flex flex-col">
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Logo />
          <span className="hidden sm:inline text-muted-foreground/60">/</span>
          <span className="hidden sm:inline text-body font-medium text-muted-foreground">
            Research & strategy
          </span>
        </div>
        <nav className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <Link to="/mcp">MCP</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <Link to="/research">Research</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <Link to="/docs">Docs</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              <Github className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </Button>
          <Button size="sm" asChild>
            <Link to="/sign-up">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>

    <main className="flex-1">{children}</main>

    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-5 flex flex-col sm:flex-row items-center sm:justify-between gap-2 text-meta text-muted-foreground">
        <div className="flex items-center gap-3">
          <Logo size={20} />
          <span>© {new Date().getFullYear()} AnveGuard · Apache 2.0</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/mcp" className="hover:text-foreground transition-colors">MCP</Link>
          <Link to="/research" className="hover:text-foreground transition-colors">Research</Link>
          <Link to="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            GitHub <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  </div>
);

export default MarketingShell;
