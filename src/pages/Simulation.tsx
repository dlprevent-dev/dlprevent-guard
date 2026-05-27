import { Link } from "react-router-dom";
import { ArrowRight, Github, Pause, Play, RotateCcw, ShieldCheck, Zap, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Seo } from "@/components/seo";
import { cn } from "@/lib/utils";
import { useSimulation, STEPS, type SimMode } from "@/components/simulation/useSimulation";
import { GridBackdrop } from "@/components/simulation/GridBackdrop";
import {
  AgentChat,
  GitHubIssueCard,
  ToolCallList,
  ThreatScoreGauge,
  PolicyPipeline,
  TelemetrySparkline,
  AuditLogStream,
  AttackTimeline,
  DashboardGrid,
  OutcomeReveal,
} from "@/components/simulation/SimulationParts";

const GITHUB_URL = "https://github.com/ANVE-AI/prompt-sentinel-flow";

const Simulation = () => {
  const sim = useSimulation("protected");

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Seo
        title="AI Agent Attack Simulation — Watch AnveGuard block prompt injection in real time"
        description="Cinematic live simulation: an AI agent receives an indirect prompt injection via a GitHub issue, attempts secret access and exfiltration, and AnveGuard intercepts at the tool layer with policy enforcement and immutable audit."
        path="/simulation"
      />

      {/* ============================================================
       *  HEADER
       * ============================================================ */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 md:px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Logo />
            <span className="hidden sm:inline text-muted-foreground/50">/</span>
            <span className="hidden sm:inline text-body font-mono text-muted-foreground">simulation</span>
            <span className="ml-2 hidden md:inline-flex items-center gap-1.5 rounded-full border border-status-block/40 bg-status-block/10 px-2 py-0.5 text-meta font-mono text-status-block">
              <span className="h-1.5 w-1.5 rounded-full bg-status-block animate-pulse" />
              live attack in progress
            </span>
          </div>
          <nav className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link to="/">Home</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link to="/mcp">MCP</Link>
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
              <Link to="/sign-up">Deploy AnveGuard</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* ============================================================
       *  HERO
       * ============================================================ */}
      <section className="relative border-b border-border overflow-hidden">
        <GridBackdrop />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 lg:pt-20 lg:pb-16 grid lg:grid-cols-[1.1fr_1fr] gap-10 items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/80 backdrop-blur px-3 py-1 text-meta font-mono text-muted-foreground">
              <Zap className="h-3 w-3 text-primary" />
              live runtime · prompt-sentinel-v0.4
            </div>
            <h1 className="mt-5 text-display-lg lg:text-display-xl font-medium text-foreground tracking-tight">
              Your AI agent <span className="text-status-block">just got hacked.</span>
            </h1>
            <p className="mt-4 text-h2 text-muted-foreground max-w-xl">
              Prompt injection is becoming SQL injection for AI systems. Watch a real attack chain unfold below — and watch AnveGuard intercept it at the tool layer in real time.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <a href="#stage">
                  Watch attack simulation <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <Github className="h-4 w-4" /> View on GitHub
                </a>
              </Button>
            </div>
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 max-w-xl text-meta">
              {[
                ["6", "attack stages"],
                ["3", "tool calls"],
                ["5", "policy detectors"],
                ["0 B", "exfiltrated (protected)"],
              ].map(([v, l]) => (
                <div key={l}>
                  <div className="text-h1 font-mono text-foreground tabular-nums">{v}</div>
                  <div className="text-muted-foreground">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* hero terminal preview — uses live trace data */}
          <div className="lg:pl-4">
            <HeroTerminal sim={sim} />
          </div>
        </div>
      </section>

      {/* ============================================================
       *  MODE TOGGLE + TRANSPORT
       * ============================================================ */}
      <section className="sticky top-12 z-20 border-b border-border bg-background/90 backdrop-blur" id="stage">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <ModeToggle mode={sim.mode} onChange={sim.swapMode} />
          <Transport
            playing={sim.playing}
            onToggle={sim.toggle}
            onRestart={sim.restart}
            speed={sim.speed}
            onSpeed={sim.setSpeed}
            step={sim.step}
          />
        </div>
      </section>

      {/* ============================================================
       *  TIMELINE
       * ============================================================ */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
          <AttackTimeline step={sim.step} onScrub={sim.scrubTo} />
        </div>
      </section>

      {/* ============================================================
       *  CENTERPIECE STAGE
       * ============================================================ */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 bg-grid-fade opacity-30 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 py-10 grid lg:grid-cols-2 gap-6">
          {/* LEFT — agent surface */}
          <div className="space-y-5">
            <SectionLabel>Agent surface</SectionLabel>
            <AgentChat step={sim.step} />
            <GitHubIssueCard step={sim.step} />
            <ToolCallList step={sim.step} mode={sim.mode} />
          </div>

          {/* RIGHT — control plane */}
          <div className="space-y-5">
            <SectionLabel>AnveGuard control plane</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ThreatScoreGauge score={sim.threatScore} mode={sim.mode} />
              <TelemetrySparkline step={sim.step} mode={sim.mode} />
            </div>
            <PolicyPipeline step={sim.step} mode={sim.mode} />
            <AuditLogStream visibleLines={sim.visibleLines} />
          </div>
        </div>
      </section>

      {/* ============================================================
       *  DASHBOARD GRID
       * ============================================================ */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-10 space-y-5">
          <SectionLabel>Runtime telemetry</SectionLabel>
          <DashboardGrid step={sim.step} mode={sim.mode} />
        </div>
      </section>

      {/* ============================================================
       *  OUTCOME REVEAL
       * ============================================================ */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">
          <OutcomeReveal mode={sim.mode} visible={sim.isDone} />
          {!sim.isDone && (
            <div className="rounded-lg border border-dashed border-border bg-card/30 p-8 text-center">
              <div className="text-meta font-mono uppercase tracking-wider text-muted-foreground">awaiting verdict</div>
              <div className="mt-2 text-h1 text-foreground">
                Step {Math.min(sim.step + 1, STEPS.length)} of {STEPS.length} · {STEPS[Math.min(sim.step, STEPS.length - 1)]?.label}
              </div>
              <div className="mt-1 text-body text-muted-foreground">
                {STEPS[Math.min(sim.step, STEPS.length - 1)]?.description}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================
       *  BOTTOM CTA
       * ============================================================ */}
      <section className="relative overflow-hidden border-b border-border">
        <GridBackdrop className="opacity-70" />
        <div className="relative mx-auto max-w-5xl px-4 md:px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/80 backdrop-blur px-3 py-1 text-meta font-mono text-muted-foreground">
            <ShieldCheck className="h-3 w-3 text-status-ok" />
            inspect · enforce · audit
          </div>
          <h2 className="mt-5 text-display-lg lg:text-display-xl font-medium tracking-tight">
            Runtime security for <span className="text-primary">autonomous AI systems.</span>
          </h2>
          <p className="mt-4 text-h2 text-muted-foreground max-w-2xl mx-auto">
            One control layer between every app, every agent, and every model. Policy-enforced tool calls, immutable audit, and a real-time trace you can scrub through.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/sign-up">Deploy AnveGuard <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                <Github className="h-4 w-4" /> Star on GitHub
              </a>
            </Button>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 text-meta font-mono text-muted-foreground">
            <Keyboard className="h-3 w-3" />
            <kbd className="px-1.5 py-0.5 border border-border rounded bg-surface-2">space</kbd> play/pause
            <kbd className="ml-2 px-1.5 py-0.5 border border-border rounded bg-surface-2">←</kbd>
            <kbd className="px-1.5 py-0.5 border border-border rounded bg-surface-2">→</kbd> scrub
            <kbd className="ml-2 px-1.5 py-0.5 border border-border rounded bg-surface-2">M</kbd> toggle mode
            <kbd className="ml-2 px-1.5 py-0.5 border border-border rounded bg-surface-2">R</kbd> restart
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-5 flex flex-col sm:flex-row items-center sm:justify-between gap-2 text-meta text-muted-foreground">
          <div className="flex items-center gap-3">
            <Logo size={20} />
            <span>© {new Date().getFullYear()} AnveGuard · Apache 2.0</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/simulation" className="hover:text-foreground transition-colors">Simulation</Link>
            <Link to="/mcp" className="hover:text-foreground transition-colors">MCP</Link>
            <Link to="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

/* ============================================================
 *  small subcomponents (kept colocated)
 * ============================================================ */

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 text-meta font-mono uppercase tracking-wider text-muted-foreground">
    <span className="h-px w-6 bg-border-strong" />
    {children}
  </div>
);

const ModeToggle = ({ mode, onChange }: { mode: SimMode; onChange: (m: SimMode) => void }) => (
  <div className="inline-flex rounded-md border border-border bg-surface-1 p-0.5">
    {([
      { id: "without", label: "Without AnveGuard", tone: "text-status-block" },
      { id: "protected", label: "Protected by AnveGuard", tone: "text-status-ok" },
    ] as const).map((opt) => {
      const active = mode === opt.id;
      return (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "px-3 py-1.5 text-meta font-mono rounded-[5px] transition-all",
            active
              ? "bg-surface-3 text-foreground shadow-pop"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={active}
        >
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-2 align-middle", opt.id === "without" ? "bg-status-block" : "bg-status-ok")} />
          {opt.label}
        </button>
      );
    })}
  </div>
);

const Transport = ({
  playing, onToggle, onRestart, speed, onSpeed, step,
}: {
  playing: boolean; onToggle: () => void; onRestart: () => void;
  speed: 1 | 2; onSpeed: (s: 1 | 2) => void; step: number;
}) => (
  <div className="flex items-center gap-2 text-meta font-mono text-muted-foreground">
    <span className="hidden md:inline">step {Math.min(step, STEPS.length)}/{STEPS.length}</span>
    <Button size="sm" variant="outline" onClick={onToggle} className="h-7">
      {playing ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Play</>}
    </Button>
    <Button size="sm" variant="outline" onClick={onRestart} className="h-7">
      <RotateCcw className="h-3 w-3" /> Restart
    </Button>
    <div className="inline-flex rounded-md border border-border bg-surface-1 p-0.5">
      {([1, 2] as const).map((s) => (
        <button
          key={s}
          onClick={() => onSpeed(s)}
          className={cn(
            "px-2 py-1 text-meta rounded-[5px]",
            speed === s ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {s}×
        </button>
      ))}
    </div>
  </div>
);

const HeroTerminal = ({ sim }: { sim: ReturnType<typeof useSimulation> }) => {
  const lines = sim.visibleLines.slice(-10);
  const toneCls = {
    user: "text-muted-foreground",
    agent: "text-foreground",
    anveguard: "text-primary",
    tool: "text-status-warn",
    audit: "text-status-ok",
    system: "text-muted-foreground italic",
  } as const;

  return (
    <div className="rounded-lg border border-border bg-card/70 backdrop-blur-sm shadow-[0_0_0_1px_hsl(var(--border-strong)/0.4),0_30px_80px_-30px_hsl(var(--primary)/0.6)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-status-block/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-status-warn/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-status-ok/70" />
        </div>
        <span className="text-meta font-mono text-muted-foreground">anveguard · runtime trace</span>
        <span className="text-meta font-mono text-primary">{sim.mode}</span>
      </div>
      <pre className="px-4 py-3 text-meta font-mono leading-6 min-h-[18rem] max-h-[20rem] overflow-y-auto">
        {lines.length === 0 && <div className="text-muted-foreground italic">waiting for traffic…</div>}
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap break-words animate-fade-in">
            <span className={cn("mr-2 select-none", toneCls[l.tone])}>[{l.tone}]</span>
            <span className={cn(l.highlight && "font-semibold text-foreground")}>{l.text}</span>
          </div>
        ))}
        {!sim.isDone && (
          <div>
            <span className="inline-block h-3 w-1.5 bg-primary align-[-2px] animate-pulse" />
          </div>
        )}
      </pre>
    </div>
  );
};

export default Simulation;
