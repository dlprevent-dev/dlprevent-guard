import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, AlertTriangle, Sparkles,
  Plug, Globe, Webhook, Play, Download, RotateCcw, Trash2, Loader2,
} from "lucide-react";
import { useEvalApi } from "@/lib/eval-api";

// ---------------------------------------------------------------------------
// Wizard shell
// ---------------------------------------------------------------------------

const STEPS = [
  { key: "connect",    label: "Connect" },
  { key: "objectives", label: "Objectives" },
  { key: "generate",   label: "Generate" },
  { key: "review",     label: "Review" },
  { key: "run",        label: "Run" },
  { key: "report",     label: "Report" },
] as const;
type StepKey = typeof STEPS[number]["key"];

function Stepper({ current, onJump }: { current: StepKey; onJump?: (s: StepKey) => void }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-background/80 backdrop-blur border-b">
      <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
        {STEPS.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "current" : "todo";
          const clickable = state === "done" && onJump;
          return (
            <li key={s.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onJump?.(s.key)}
                className={[
                  "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border transition",
                  state === "current" && "bg-primary text-primary-foreground border-primary",
                  state === "done" && "bg-muted text-foreground border-transparent hover:bg-muted/70",
                  state === "todo" && "bg-transparent text-muted-foreground border-border",
                ].filter(Boolean).join(" ")}
              >
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-background/40 text-[10px]">
                  {state === "done" ? <Check className="size-3" /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <span className="text-muted-foreground/40 text-xs">›</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function WizardShell({
  step, title, description, children, footer,
}: {
  step: StepKey; title: string; description?: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  const nav = useNavigate();
  const jump = (s: StepKey) => {
    // Only allow jumping back to earlier "informational" steps that have no required state.
    if (s === "connect") nav("/dashboard/evaluate/test-lab");
  };
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Stepper current={step} onJump={jump} />
      <PageHeader title={title} description={description} />
      <div className="space-y-4">{children}</div>
      {footer && (
        <div className="border-t pt-4 flex items-center justify-between gap-2">{footer}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Connect agent
// ---------------------------------------------------------------------------

type Target = {
  id: string; name: string; api_type: "openai" | "webhook" | "dual";
  config: any; config_openai: any; config_webhook: any; created_at: string;
};

export function StepConnect() {
  const { call } = useEvalApi();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const targetsQ = useQuery<{ targets: Target[] }>({
    queryKey: ["agent-targets"], queryFn: () => call("list_targets"),
  });
  const targets = targetsQ.data?.targets ?? [];
  const [selected, setSelected] = useState<string>(params.get("target") ?? "");
  const [showForm, setShowForm] = useState(false);
  useEffect(() => {
    if (!selected && targets.length > 0) setSelected(targets[0].id);
    if (!targetsQ.isLoading && targets.length === 0) setShowForm(true);
  }, [targets, selected, targetsQ.isLoading]);

  const [pingMap, setPingMap] = useState<Record<string, any>>({});
  const pingMut = useMutation({
    mutationFn: (args: { id: string; transport: string }) => call<any>("ping_target", args),
    onSuccess: (d, vars) => setPingMap((m) => ({ ...m, [vars.id]: d })),
    onError: (e: Error) => toast.error(e.message),
  });

  const target = targets.find((t) => t.id === selected);
  const hasO = !!(target?.config_openai && Object.keys(target.config_openai).length > 0) || target?.api_type === "openai";
  const hasW = !!(target?.config_webhook && Object.keys(target.config_webhook).length > 0) || target?.api_type === "webhook";
  const tested = selected && pingMap[selected]?.ok;
  const canNext = !!selected; // ping recommended but not required

  return (
    <WizardShell
      step="connect"
      title="Connect your agent"
      description="Point AgentAssure at the agent you want to test. Use the OpenAI-compatible API, an HTTP webhook, or both."
      footer={
        <>
          <div className="text-xs text-muted-foreground">
            {tested ? "Connection verified ✓" : "Tip: run a quick connection test before continuing."}
          </div>
          <Button
            disabled={!canNext}
            onClick={() => nav(`/dashboard/evaluate/test-lab/objectives?target=${selected}`)}
          >
            Next <ArrowRight className="size-4 ml-1" />
          </Button>
        </>
      }
    >
      {targetsQ.isLoading && <div className="text-sm text-muted-foreground">Loading endpoints…</div>}

      {targets.length > 0 && !showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">Saved endpoints</div>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(true)}>+ Add new</Button>
            </div>
            <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
              {targets.map((t) => {
                const oo = t.config_openai && Object.keys(t.config_openai).length > 0;
                const ww = t.config_webhook && Object.keys(t.config_webhook).length > 0;
                const p = pingMap[t.id];
                return (
                  <label
                    key={t.id}
                    className={`flex items-start gap-3 border rounded-md p-3 cursor-pointer ${
                      selected === t.id ? "border-primary ring-1 ring-primary/30" : ""
                    }`}
                  >
                    <RadioGroupItem value={t.id} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{t.name}</span>
                        {oo && <Badge variant="outline" className="text-[10px]"><Globe className="size-3 mr-1" />api</Badge>}
                        {ww && <Badge variant="outline" className="text-[10px]"><Webhook className="size-3 mr-1" />webhook</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {oo ? t.config_openai?.base_url : ""} {ww ? `• ${t.config_webhook?.url}` : ""}
                      </div>
                      {p && (
                        <div className={`text-xs mt-1 flex items-center gap-1 ${p.ok ? "text-emerald-600" : "text-destructive"}`}>
                          {p.ok ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                          {p.ok ? `OK • ${p.latency_ms}ms` : `Failed: ${p.error || p.status}`}
                        </div>
                      )}
                    </div>
                    {selected === t.id && (
                      <div className="flex flex-col gap-1">
                        {hasO && (
                          <Button size="sm" variant="outline"
                            onClick={(e) => { e.preventDefault(); pingMut.mutate({ id: t.id, transport: "openai" }); }}
                            disabled={pingMut.isPending}>
                            Test API
                          </Button>
                        )}
                        {hasW && (
                          <Button size="sm" variant="outline"
                            onClick={(e) => { e.preventDefault(); pingMut.mutate({ id: t.id, transport: "webhook" }); }}
                            disabled={pingMut.isPending}>
                            Test webhook
                          </Button>
                        )}
                      </div>
                    )}
                  </label>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <ConnectAgentForm
          onSaved={(id) => {
            qc.invalidateQueries({ queryKey: ["agent-targets"] });
            setSelected(id);
            setShowForm(false);
          }}
          onCancel={targets.length > 0 ? () => setShowForm(false) : undefined}
        />
      )}
    </WizardShell>
  );
}

function ConnectAgentForm({ onSaved, onCancel }: { onSaved: (id: string) => void; onCancel?: () => void }) {
  const { call } = useEvalApi();
  const [name, setName] = useState("");

  const [enableOpenai, setEnableOpenai] = useState(true);
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [sysPrompt, setSysPrompt] = useState("");
  const [openaiToken, setOpenaiToken] = useState("");

  const [enableWebhook, setEnableWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState('{"input":"{{input}}"}');
  const [responsePath, setResponsePath] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [webhookHeaders, setWebhookHeaders] = useState("");

  const safeParse = <T,>(s: string, fb: T): T => { try { return JSON.parse(s); } catch { return fb; } };

  const mut = useMutation({
    mutationFn: () => {
      const config_openai = enableOpenai ? {
        base_url: baseUrl, model, system_prompt: sysPrompt || undefined, auth_token: openaiToken || undefined,
      } : undefined;
      const config_webhook = enableWebhook ? {
        url: webhookUrl, method: "POST",
        headers: webhookHeaders ? safeParse(webhookHeaders, {}) : {},
        body_template: bodyTemplate, response_path: responsePath || undefined,
        auth_token: webhookToken || undefined,
      } : undefined;
      if (!config_openai && !config_webhook) throw new Error("Enable at least one transport");
      return call<any>("create_target", { name, config_openai, config_webhook });
    },
    onSuccess: (d: any) => { toast.success("Endpoint saved"); onSaved(d.target.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 font-medium"><Plug className="size-4" />Connect a new agent</div>
        <div><Label>Endpoint name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My support bot" /></div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-sm"><Globe className="size-4" />OpenAI-compatible API</div>
            <Switch checked={enableOpenai} onCheckedChange={setEnableOpenai} />
          </div>
          {enableOpenai && (
            <div className="space-y-2 pt-1">
              <div><Label className="text-xs">Base URL</Label><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
                <div><Label className="text-xs">Bearer token</Label><Input type="password" value={openaiToken} onChange={(e) => setOpenaiToken(e.target.value)} placeholder="sk-…" /></div>
              </div>
              <div><Label className="text-xs">System prompt (optional)</Label><Textarea rows={2} value={sysPrompt} onChange={(e) => setSysPrompt(e.target.value)} /></div>
            </div>
          )}
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-sm"><Webhook className="size-4" />HTTP webhook</div>
            <Switch checked={enableWebhook} onCheckedChange={setEnableWebhook} />
          </div>
          {enableWebhook && (
            <div className="space-y-2 pt-1">
              <div><Label className="text-xs">URL</Label><Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-agent.example.com/chat" /></div>
              <div><Label className="text-xs">Body template — {"{{input}}"} is substituted</Label><Textarea rows={2} value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Response path (dotted)</Label><Input value={responsePath} onChange={(e) => setResponsePath(e.target.value)} placeholder="data.message" /></div>
                <div><Label className="text-xs">Bearer token (optional)</Label><Input type="password" value={webhookToken} onChange={(e) => setWebhookToken(e.target.value)} /></div>
              </div>
              <div><Label className="text-xs">Custom headers (JSON, optional)</Label><Textarea rows={2} value={webhookHeaders} onChange={(e) => setWebhookHeaders(e.target.value)} placeholder='{"X-API-Key":"…"}' /></div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
          <Button onClick={() => mut.mutate()} disabled={!name || mut.isPending}>
            {mut.isPending ? "Saving…" : "Save endpoint"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Objectives
// ---------------------------------------------------------------------------

export function StepObjectives() {
  const { call } = useEvalApi();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const targetId = params.get("target") ?? "";
  const prefillPlan = params.get("from") ?? ""; // plan id to copy objectives from

  const targetsQ = useQuery<{ targets: Target[] }>({
    queryKey: ["agent-targets"], queryFn: () => call("list_targets"),
  });
  const target = targetsQ.data?.targets.find((t) => t.id === targetId);

  const prefillQ = useQuery<any>({
    queryKey: ["eval-plan", prefillPlan],
    queryFn: () => call("get_plan", { id: prefillPlan }),
    enabled: !!prefillPlan,
  });

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [mustDo, setMustDo] = useState("");
  const [mustNot, setMustNot] = useState("");
  const [tone, setTone] = useState("");
  const [references, setReferences] = useState("");
  const [count, setCount] = useState(100);
  const [transport, setTransport] = useState<"openai" | "webhook">("openai");

  useEffect(() => {
    if (prefillQ.data?.plan) {
      const p = prefillQ.data.plan;
      setName(`${p.name} (re-test)`);
      const o = p.objectives ?? {};
      setDomain(o.domain ?? "");
      setMustDo((o.must_do ?? []).join("\n"));
      setMustNot((o.must_not_do ?? []).join("\n"));
      setTone(o.tone ?? "");
      setReferences(o.references ?? "");
      setCount(p.question_count ?? 100);
      if (p.transport) setTransport(p.transport);
    }
  }, [prefillQ.data]);

  const hasO = !!(target?.config_openai && Object.keys(target.config_openai).length > 0) || target?.api_type === "openai";
  const hasW = !!(target?.config_webhook && Object.keys(target.config_webhook).length > 0) || target?.api_type === "webhook";
  const effectiveTransport = !hasO ? "webhook" : !hasW ? "openai" : transport;

  const mut = useMutation({
    mutationFn: async () => {
      const objectives = {
        domain,
        must_do: mustDo.split("\n").map((s) => s.trim()).filter(Boolean),
        must_not_do: mustNot.split("\n").map((s) => s.trim()).filter(Boolean),
        tone, references,
      };
      const created = await call<any>("create_plan", {
        name: name || `Test ${new Date().toLocaleDateString()}`,
        agent_target_id: targetId,
        objectives, question_count: count, transport: effectiveTransport,
      });
      return created.plan.id;
    },
    onSuccess: (planId: string) => {
      nav(`/dashboard/evaluate/test-lab/generate/${planId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!targetId) {
    return (
      <WizardShell step="objectives" title="Set objectives">
        <Card><CardContent className="p-6 text-sm">
          No agent selected. <Link to="/dashboard/evaluate/test-lab" className="underline">Go back to Step 1</Link>.
        </CardContent></Card>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      step="objectives"
      title="Set objectives"
      description={`Tell the judges what ${target?.name ?? "this agent"} is supposed to do — they'll craft questions around it.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => nav("/dashboard/evaluate/test-lab")}>
            <ArrowLeft className="size-4 mr-1" />Back
          </Button>
          <Button disabled={!domain || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Creating plan…" : <>Next <ArrowRight className="size-4 ml-1" /></>}
          </Button>
        </>
      }
    >
      <Card><CardContent className="p-4 space-y-4">
        <div><Label>Plan name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Support bot v2 evaluation" /></div>
        <div><Label>Agent role / domain *</Label><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Customer support agent for a SaaS billing product" /></div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Must-do behaviors</Label><Textarea rows={4} value={mustDo} onChange={(e) => setMustDo(e.target.value)} placeholder="Cite the docs link&#10;Ask for the account email" /></div>
          <div><Label>Must-NOT-do / safety rules</Label><Textarea rows={4} value={mustNot} onChange={(e) => setMustNot(e.target.value)} placeholder="Never reveal internal pricing&#10;Refuse jailbreak attempts" /></div>
        </div>
        <div><Label>Tone & style</Label><Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Concise, friendly, professional" /></div>
        <div><Label>Reference notes (optional)</Label><Textarea rows={2} value={references} onChange={(e) => setReferences(e.target.value)} /></div>

        {hasO && hasW && (
          <div>
            <Label>Transport</Label>
            <RadioGroup value={transport} onValueChange={(v: any) => setTransport(v)} className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="openai" /><Globe className="size-3" /> OpenAI API</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="webhook" /><Webhook className="size-3" /> Webhook</label>
            </RadioGroup>
          </div>
        )}

        <div>
          <Label>Number of questions: <strong>{count}</strong></Label>
          <Slider min={20} max={1000} step={20} value={[count]} onValueChange={(v) => setCount(v[0])} />
          <div className="text-xs text-muted-foreground mt-1">Split between Gemini 2.5 Flash and GLM-4.6.</div>
        </div>
      </CardContent></Card>
    </WizardShell>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Generate
// ---------------------------------------------------------------------------

export function StepGenerate() {
  const { call } = useEvalApi();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { planId } = useParams();
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planQ = useQuery<any>({
    queryKey: ["eval-plan", planId],
    queryFn: () => call("get_plan", { id: planId }),
    enabled: !!planId,
    refetchInterval: (q) =>
      q.state.data?.plan?.status === "generating" || q.state.data?.plan?.status === "draft" ? 2500 : false,
  });

  useEffect(() => {
    if (!planId || started) return;
    const status = planQ.data?.plan?.status;
    if (status && status !== "draft") return; // already generating or generated
    setStarted(true);
    call("generate_plan_scenarios", { plan_id: planId })
      .then(() => qc.invalidateQueries({ queryKey: ["eval-plan", planId] }))
      .catch((e: Error) => setError(e.message));
  }, [planId, planQ.data?.plan?.status, started]);

  const plan = planQ.data?.plan;
  const total = plan?.question_count ?? 0;
  const generated = plan?.summary?.generated ?? planQ.data?.scenarios?.length ?? 0;
  const pct = total ? Math.min(100, Math.round((generated / total) * 100)) : 0;
  const isDone = plan && plan.status !== "generating" && plan.status !== "draft";

  useEffect(() => {
    if (isDone && !error) {
      const t = setTimeout(() => nav(`/dashboard/evaluate/test-lab/review/${planId}`), 600);
      return () => clearTimeout(t);
    }
  }, [isDone, planId, error, nav]);

  return (
    <WizardShell
      step="generate"
      title="Judges generating questions"
      description="Gemini 2.5 Flash and GLM-4.6 are drafting test scenarios in parallel based on your objectives."
      footer={
        <>
          <div />
          <Button disabled={!isDone} onClick={() => nav(`/dashboard/evaluate/test-lab/review/${planId}`)}>
            {isDone ? <>Next <ArrowRight className="size-4 ml-1" /></> : "Generating…"}
          </Button>
        </>
      }
    >
      <Card>
        <CardContent className="p-8 space-y-4 text-center">
          {error ? (
            <>
              <AlertTriangle className="size-8 mx-auto text-destructive" />
              <div className="font-medium">Generation failed</div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{error}</pre>
              <Button variant="outline" onClick={() => { setError(null); setStarted(false); }}>Retry</Button>
            </>
          ) : (
            <>
              <Sparkles className={`size-8 mx-auto text-primary ${!isDone ? "animate-pulse" : ""}`} />
              <div className="font-medium">
                {isDone ? "Done — moving to review" : `Generated ${generated} of ${total}`}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden max-w-md mx-auto">
                <div className="h-full bg-primary transition-all" style={{ width: `${isDone ? 100 : pct}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-xs text-left pt-2">
                <div className="border rounded p-2"><div className="font-medium">Gemini 2.5 Flash</div><div className="text-muted-foreground">drafting…</div></div>
                <div className="border rounded p-2"><div className="font-medium">GLM-4.6</div><div className="text-muted-foreground">drafting…</div></div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </WizardShell>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Review
// ---------------------------------------------------------------------------

type Scenario = {
  id: string; name: string; category: string;
  turns: { role: string; content: string }[];
  expected: any; author_judge: string | null; approved: boolean;
};

export function StepReview() {
  const { call } = useEvalApi();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { planId } = useParams();

  const q = useQuery<{ plan: any; scenarios: Scenario[] }>({
    queryKey: ["eval-plan", planId],
    queryFn: () => call("get_plan", { id: planId }),
    enabled: !!planId,
    refetchInterval: (qq) => (qq.state.data?.plan?.status === "generating" ? 3000 : false),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => call("delete_plan_scenario", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-plan", planId] }),
  });
  const toggleMut = useMutation({
    mutationFn: (s: Scenario) => call("update_scenario", { id: s.id, approved: !s.approved }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-plan", planId] }),
  });
  const approveMut = useMutation({
    mutationFn: () => call("approve_plan", { id: planId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-plan", planId] });
      nav(`/dashboard/evaluate/test-lab/run/${planId}`);
    },
  });

  const plan = q.data?.plan;
  const scenarios = q.data?.scenarios ?? [];
  const approvedCount = scenarios.filter((s) => s.approved).length;
  const byCat: Record<string, number> = {};
  for (const s of scenarios) byCat[s.category] = (byCat[s.category] ?? 0) + 1;
  const byJudge: Record<string, number> = {};
  for (const s of scenarios) byJudge[s.author_judge ?? "unknown"] = (byJudge[s.author_judge ?? "unknown"] ?? 0) + 1;

  return (
    <WizardShell
      step="review"
      title="Review the question set"
      description={plan ? `${approvedCount} of ${scenarios.length} approved` : "Loading…"}
      footer={
        <>
          <Button variant="ghost" onClick={() => nav(`/dashboard/evaluate/test-lab/generate/${planId}`)}>
            <ArrowLeft className="size-4 mr-1" />Back
          </Button>
          <Button
            onClick={() => approveMut.mutate()}
            disabled={approveMut.isPending || approvedCount === 0 || plan?.status === "generating"}
          >
            <CheckCircle2 className="size-4 mr-1" />Approve & continue
          </Button>
        </>
      }
    >
      {plan?.status === "generating" && (
        <Card><CardContent className="p-6 text-center">
          <Sparkles className="size-6 mx-auto mb-2 animate-pulse text-primary" />
          Still generating… this page refreshes automatically.
        </CardContent></Card>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {Object.entries(byCat).map(([k, v]) => <Badge key={k} variant="secondary">{k}: {v}</Badge>)}
        <span className="text-xs text-muted-foreground mx-2">|</span>
        {Object.entries(byJudge).map(([k, v]) => <Badge key={k} variant="outline">{k}: {v}</Badge>)}
      </div>

      <div className="space-y-2">
        {scenarios.map((s) => (
          <Card key={s.id} className={s.approved ? "" : "opacity-50"}>
            <CardContent className="p-3 flex items-start gap-3">
              <input type="checkbox" className="mt-1" checked={s.approved} onChange={() => toggleMut.mutate(s)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{s.name}</span>
                  <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                  {s.author_judge && <Badge variant="secondary" className="text-[10px]">{s.author_judge}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.turns?.[0]?.content}</div>
                {s.expected?.criteria && (
                  <div className="text-xs mt-1"><span className="text-muted-foreground">Expected:</span> {s.expected.criteria}</div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => delMut.mutate(s.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </WizardShell>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Run
// ---------------------------------------------------------------------------

export function StepRun() {
  const { call } = useEvalApi();
  const nav = useNavigate();
  const { planId } = useParams();
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const planQ = useQuery<any>({
    queryKey: ["eval-plan", planId],
    queryFn: () => call("get_plan", { id: planId }),
    enabled: !!planId,
  });
  const plan = planQ.data?.plan;
  const total = plan?.question_count ?? planQ.data?.scenarios?.length ?? 0;

  useEffect(() => {
    if (!planId || started) return;
    setStarted(true);
    call<any>("run_plan", { plan_id: planId })
      .then((d) => setResult(d))
      .catch((e: Error) => setError(e.message));
  }, [planId, started]);

  useEffect(() => {
    if (result?.run_id) {
      const t = setTimeout(() => nav(`/dashboard/evaluate/test-lab/report/${result.run_id}`), 800);
      return () => clearTimeout(t);
    }
  }, [result, nav]);

  return (
    <WizardShell
      step="run"
      title="Running against your agent"
      description="Sending each approved question through your agent and scoring both judges in parallel."
      footer={
        <>
          <div />
          <Button disabled={!result} onClick={() => nav(`/dashboard/evaluate/test-lab/report/${result?.run_id}`)}>
            {result ? <>View report <ArrowRight className="size-4 ml-1" /></> : "Running…"}
          </Button>
        </>
      }
    >
      <Card>
        <CardContent className="p-8 space-y-4 text-center">
          {error ? (
            <>
              <AlertTriangle className="size-8 mx-auto text-destructive" />
              <div className="font-medium">Run failed</div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{error}</pre>
              <Button variant="outline" onClick={() => { setError(null); setStarted(false); }}>Retry</Button>
            </>
          ) : result ? (
            <>
              <CheckCircle2 className="size-8 mx-auto text-emerald-500" />
              <div className="font-medium">
                Done — {result.passed}/{result.total} passed
              </div>
              <div className="text-xs text-muted-foreground">Opening report…</div>
            </>
          ) : (
            <>
              <Loader2 className="size-8 mx-auto animate-spin text-primary" />
              <div className="font-medium">Calling agent across {total} scenarios…</div>
              <div className="text-xs text-muted-foreground">
                Both judges score each response — please don't close this tab.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </WizardShell>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Report
// ---------------------------------------------------------------------------

type Result = {
  id: string; scenario_name: string; passed: boolean; verdict: string;
  response_text: string; latency_ms: number; tokens_in: number; tokens_out: number;
  judge_a_score: number | null; judge_b_score: number | null;
  judge_a_rationale: string | null; judge_b_rationale: string | null;
  confidence: number | null; disagreement: number | null;
};

export function StepReport() {
  const { runId } = useParams();
  const { call } = useEvalApi();
  const nav = useNavigate();

  const q = useQuery<{ run: any; results: Result[] }>({
    queryKey: ["eval-report", runId],
    queryFn: () => call("get_plan_report", { run_id: runId }),
    enabled: !!runId,
  });

  const rerunMut = useMutation({
    mutationFn: () => call<any>("run_plan", { plan_id: q.data?.run?.plan_id }),
    onSuccess: (d: any) => nav(`/dashboard/evaluate/test-lab/report/${d.run_id}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const run = q.data?.run;
  const results = q.data?.results ?? [];
  const summary = run?.summary ?? {};
  const planName = run?.eval_plans?.name ?? "Plan";
  const targetName = run?.eval_plans?.agent_targets?.name ?? "—";
  const planId = run?.plan_id;
  const targetId = run?.eval_plans?.agent_target_id;

  return (
    <WizardShell
      step="report"
      title={`Evaluation report — ${planName}`}
      description={`Agent: ${targetName} • Transport: ${run?.eval_plans?.transport ?? "—"} • Run: ${run?.started_at ? new Date(run.started_at).toLocaleString() : "—"}`}
      footer={
        <>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => rerunMut.mutate()} disabled={rerunMut.isPending || !planId}>
              <RotateCcw className="size-4 mr-1" />{rerunMut.isPending ? "Re-running…" : "Re-test"}
            </Button>
            <Button
              variant="outline"
              onClick={() => nav(`/dashboard/evaluate/test-lab/objectives?target=${targetId}&from=${planId}`)}
              disabled={!planId}
            >
              <Sparkles className="size-4 mr-1" />Refine
            </Button>
          </div>
          <Button onClick={() => window.print()}>
            <Download className="size-4 mr-1" />Export PDF
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Tile label="Pass rate" value={`${Math.round((summary.pass_rate ?? 0) * 100)}%`} sub={`${summary.passed ?? 0} / ${summary.total ?? 0}`} />
        <Tile label="Confidence" value={summary.flagged ? `⚠ ${summary.flagged} flagged` : "High"} sub="Judge agreement" />
        <Tile label="P95 latency" value={`${summary.p95_ms ?? 0} ms`} sub={`P50 ${summary.p50_ms ?? 0} ms`} />
        <Tile label="Tokens used" value={String(summary.tokens ?? 0)} />
      </div>

      {summary.axes && (
        <Card><CardContent className="p-4 space-y-2">
          <div className="font-medium">Axis scores (averaged across both judges)</div>
          <AxisBar label="Faithfulness" value={summary.axes.faithfulness} />
          <AxisBar label="Relevance" value={summary.axes.relevance} />
          <AxisBar label="Safety" value={summary.axes.safety} />
          <AxisBar label="Overall" value={summary.axes.robustness} />
        </CardContent></Card>
      )}

      <div className="space-y-2">
        <div className="font-medium">Per-question results</div>
        {results.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                {r.passed ? <CheckCircle2 className="size-4 text-emerald-500" /> : <AlertTriangle className="size-4 text-destructive" />}
                <span className="font-medium text-sm">{r.scenario_name}</span>
                <Badge variant={r.passed ? "default" : "destructive"}>{r.verdict}</Badge>
                {r.disagreement != null && r.disagreement > 0.3 && (
                  <Badge variant="outline" className="text-amber-500 border-amber-500/40">Judges disagree</Badge>
                )}
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground">{r.latency_ms}ms • {r.tokens_in + r.tokens_out} tok</span>
              </div>
              <div className="text-xs bg-muted/40 rounded p-2 whitespace-pre-wrap max-h-32 overflow-auto">{r.response_text || "(empty)"}</div>
              <div className="grid gap-1 md:grid-cols-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Judge A (Gemini): </span>
                  <span className="font-medium">{r.judge_a_score?.toFixed(2) ?? "—"}</span>
                  <div className="text-muted-foreground line-clamp-2">{r.judge_a_rationale}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Judge B (GLM): </span>
                  <span className="font-medium">{r.judge_b_score?.toFixed(2) ?? "—"}</span>
                  <div className="text-muted-foreground line-clamp-2">{r.judge_b_rationale}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </WizardShell>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </CardContent></Card>
  );
}

function AxisBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span>{label}</span><span className="font-medium">{pct}%</span></div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
