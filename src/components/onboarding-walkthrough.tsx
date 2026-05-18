import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Plug, KeyRound, Sparkles, Check, ArrowRight, ArrowLeft,
  Shield, BookOpen, Activity, PartyPopper, Route, Filter,
} from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "onboarding:walkthrough:dismissed";
/** Custom event other UI can dispatch to re-open the walkthrough on demand. */
export const OPEN_WALKTHROUGH_EVENT = "onboarding:walkthrough:open";

type DoneCtx = { hasEndpoint: boolean; hasKey: boolean };

type Step =
  | {
      kind: "intro" | "concepts" | "celebrate";
      icon: typeof Plug;
      title: string;
      body: string;
      /** Optional: secondary cards/items for the concepts step. */
      secondary?: { icon: typeof Plug; name: string; line: string }[];
    }
  | {
      kind: "action";
      icon: typeof Plug;
      title: string;
      body: string;
      ctaLabel: string;
      ctaPath: string;
      doneWhen: (ctx: DoneCtx) => boolean;
    };

const STEPS: Step[] = [
  // Step 1 — Welcome: tells the user what the app is in one sentence.
  {
    kind: "intro",
    icon: Shield,
    title: "Welcome to AnveGuard",
    body: "AnveGuard is a security control plane between your application and any LLM provider. In 60 seconds we'll set you up, then run your first guarded request.",
  },
  // Step 2 — Concepts primer: introduces the 4 primitives so the rest of
  // the dashboard reads fast. Mental model first, configuration second.
  {
    kind: "concepts",
    icon: BookOpen,
    title: "Four primitives to learn",
    body: "Once these click, every dashboard page makes sense. Each is a normal noun — nothing magic.",
    secondary: [
      { icon: Plug, name: "Endpoint", line: "An upstream provider (OpenAI, Anthropic, Perplexity, custom). Holds the provider key." },
      { icon: KeyRound, name: "API key", line: "An ag_live_… token your apps send as Bearer. Bound to one or more endpoints." },
      { icon: Filter, name: "Policy", line: "Keyword + heuristic + LLM rules that block, flag, or sanitize each request." },
      { icon: Route, name: "Route", line: "Optional rules that pick which endpoint to use based on model alias or context." },
    ],
  },
  // Step 3 — Connect: a unified flow Lovable built that does endpoint +
  // key + alias in one wizard. Replaces the old "go to Endpoints, then
  // go to Keys" two-step that lived here. New users get a much smoother
  // path; advanced users can still hit /dashboard/endpoints + /dashboard/keys
  // directly from the sidebar.
  {
    kind: "action",
    icon: Plug,
    title: "Connect a provider",
    body: "Pick a provider (OpenAI / Anthropic / Perplexity / OpenRouter / Gemini / Groq / Ollama / custom), paste your provider key, and get an AnveGuard ag_live_… key back. One short wizard — endpoint + key + alias in one pass.",
    ctaLabel: "Open Connect",
    ctaPath: "/dashboard/connect",
    doneWhen: ({ hasEndpoint, hasKey }) => hasEndpoint && hasKey,
  },
  {
    kind: "action",
    icon: Sparkles,
    title: "Try it in the Playground",
    body: "Send a real prompt through the proxy and watch every policy layer (intent, keywords, behavioral, heuristics) decide in real time.",
    ctaLabel: "Open Playground",
    ctaPath: "/dashboard/playground",
    doneWhen: () => false,
  },
  // Step 6 — Celebration + pointer to ongoing learning surfaces.
  {
    kind: "celebrate",
    icon: PartyPopper,
    title: "You're ready",
    body: "Every request now appears in Logs with verdict, latency, tokens, and per-layer policy decisions. Re-run any of them in the Playground via the Replay button. Open Threats to see live blocked-attack activity.",
  },
];

/**
 * First-run onboarding walkthrough. Auto-opens once (gated by a localStorage
 * flag) and shows a 3-step guided tour pointing users at Endpoints → Keys →
 * Playground. Each step has a "Take me there" CTA that closes the dialog and
 * routes to the relevant page. Steps are marked done automatically based on
 * whether the user already has an endpoint / key, so returning users with
 * existing data don't see false "todo" markers.
 */
export function OnboardingWalkthrough() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const { call } = useDashboardApi();

  // Cheap GETs the dashboard already runs elsewhere — react-query dedupes,
  // so we don't pay an extra request just to compute the checklist.
  const { data: endpointsData } = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<any>("list_endpoints"),
    enabled: open,
  });
  const { data: keysData } = useQuery({
    queryKey: ["keys"],
    queryFn: () => call<any>("list_keys"),
    enabled: open,
  });

  const hasEndpoint = (endpointsData?.endpoints?.length ?? 0) > 0;
  const hasKey = ((keysData?.keys ?? []) as any[]).some((k) => k.is_active);

  // Auto-open on first ever visit. We dismiss permanently after the user
  // either finishes or closes the dialog so it never nags them again.
  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY);
      if (!dismissed) setOpen(true);
    } catch {
      /* ignore */
    }
    const onOpen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_WALKTHROUGH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_WALKTHROUGH_EVENT, onOpen);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const goToStep = (s: Extract<Step, { kind: "action" }>) => {
    dismiss();
    navigate(s.ctaPath);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const isAction = current.kind === "action";
  const isDone = isAction
    ? (current as Extract<Step, { kind: "action" }>).doneWhen({ hasEndpoint, hasKey })
    : false;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Welcome to AnveGuard</DialogTitle>
          <DialogDescription>
            Five short steps — concepts first, then your first guarded request.
          </DialogDescription>
        </DialogHeader>

        {/* Step pips — clickable so users can jump around. Action steps that
            are already-satisfied show a half-primary tint so the user can
            see what's "left to do" at a glance. */}
        <div className="flex items-center gap-2 pt-1">
          {STEPS.map((s, i) => {
            const done = s.kind === "action" && s.doneWhen({ hasEndpoint, hasKey });
            const active = i === step;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "flex-1 h-1.5 rounded-full transition-colors",
                  active ? "bg-primary"
                    : done ? "bg-primary/60"
                    : "bg-muted",
                )}
                aria-label={`Go to step ${i + 1}`}
              />
            );
          })}
        </div>

        <div className="flex items-start gap-3 pt-2">
          <div
            className={cn(
              "rounded-md p-2 shrink-0",
              isDone ? "bg-status-ok/15 text-status-ok" : "bg-primary/10 text-primary",
            )}
          >
            {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Step {step + 1} of {STEPS.length}
              {isDone && <span className="ml-2 text-status-ok normal-case tracking-normal">· Already done</span>}
            </div>
            <div className="text-base font-semibold mt-0.5">{current.title}</div>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{current.body}</p>
          </div>
        </div>

        {/* Concepts step: show the 4 primitive cards inline. */}
        {current.kind === "concepts" && current.secondary && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {current.secondary.map((c) => {
              const CIcon = c.icon;
              return (
                <div key={c.name} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CIcon className="h-3.5 w-3.5 text-primary" />
                    <div className="text-xs font-semibold">{c.name}</div>
                  </div>
                  <div className="text-[11px] leading-snug text-muted-foreground">{c.line}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Celebrate step: deeper learning callout. */}
        {current.kind === "celebrate" && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
            <div className="flex items-center gap-2 mb-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">Where to go next</span>
            </div>
            <ul className="space-y-1 text-muted-foreground pl-5 list-disc">
              <li><strong>Logs</strong> — full audit history with verdict layers, replay any request</li>
              <li><strong>Threats</strong> — live blocked-attack activity + per-rule breakdown</li>
              <li><strong>Policies</strong> — add custom keywords / regex / intents</li>
              <li><strong>Alerts</strong> — webhook notifications for anomalies</li>
              <li><strong>Docs</strong> — in-app guides, API reference, error catalogue</li>
            </ul>
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {isLast ? "Close" : "Skip tour"}
            </Button>
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}
            {/* Action steps: go-to-page CTA. Non-action steps: "Next" only. */}
            {isAction && (
              <Button size="sm" onClick={() => goToStep(current as Extract<Step, { kind: "action" }>)}>
                {(current as Extract<Step, { kind: "action" }>).ctaLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isLast && (
              <Button variant="secondary" size="sm" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
            {isLast && (
              <Button size="sm" onClick={dismiss}>
                Get started
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
