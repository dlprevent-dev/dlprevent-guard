import { useState } from "react";
import { Link } from "react-router-dom";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Plug, Sparkles, Plus, Trash2, Play, CheckCircle2, AlertTriangle, Globe, Webhook } from "lucide-react";
import { useEvalApi } from "@/lib/eval-api";

type Target = {
  id: string; name: string;
  api_type: "openai" | "webhook" | "dual";
  config: any; config_openai: any; config_webhook: any;
  created_at: string;
};
type Plan = {
  id: string; name: string; status: string; question_count: number;
  transport?: "openai" | "webhook";
  objectives: any; summary: any; agent_target_id: string | null;
  agent_targets?: { name: string; api_type: string } | null;
};

export default function TestLab() {
  const { call } = useEvalApi();
  const qc = useQueryClient();
  const [tab, setTab] = useState("plans");

  const targetsQ = useQuery<{ targets: Target[] }>({ queryKey: ["agent-targets"], queryFn: () => call("list_targets") });
  const plansQ = useQuery<{ plans: Plan[] }>({ queryKey: ["eval-plans"], queryFn: () => call("list_plans"), refetchInterval: 5000 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Test Lab"
        description="Connect an agent (API or webhook), set objectives, and let the dual-judge ensemble generate, review, run, and score a full evaluation."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="plans">Test plans</TabsTrigger>
          <TabsTrigger value="targets">Agent endpoints</TabsTrigger>
          <TabsTrigger value="new">New test run</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4">
          <PlansList plans={plansQ.data?.plans ?? []} loading={plansQ.isLoading} />
        </TabsContent>

        <TabsContent value="targets" className="mt-4">
          <TargetsPanel
            targets={targetsQ.data?.targets ?? []}
            loading={targetsQ.isLoading}
            onChange={() => qc.invalidateQueries({ queryKey: ["agent-targets"] })}
          />
        </TabsContent>

        <TabsContent value="new" className="mt-4">
          <NewRunWizard
            targets={targetsQ.data?.targets ?? []}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ["eval-plans"] });
              setTab("plans");
            }}
            onNeedTarget={() => setTab("targets")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plans list
// ---------------------------------------------------------------------------
function PlansList({ plans, loading }: { plans: Plan[]; loading: boolean }) {
  const { call } = useEvalApi();
  const qc = useQueryClient();

  const runMut = useMutation({
    mutationFn: (plan_id: string) => call<any>("run_plan", { plan_id }),
    onSuccess: (data: any) => {
      toast.success(`Run complete: ${data.passed}/${data.total} passed`);
      qc.invalidateQueries({ queryKey: ["eval-plans"] });
      if (data.run_id) window.location.href = `/dashboard/evaluate/test-lab/report/${data.run_id}`;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => call("delete_plan", { id }),
    onSuccess: () => { toast.success("Plan deleted"); qc.invalidateQueries({ queryKey: ["eval-plans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (plans.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        No test plans yet. Use <strong>New test run</strong> to create one.
      </CardContent></Card>
    );
  }

  const statusBadge = (s: string) => {
    const v: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline", generating: "secondary", pending_review: "secondary", approved: "default", archived: "outline",
    };
    return <Badge variant={v[s] ?? "secondary"}>{s.replace("_", " ")}</Badge>;
  };

  return (
    <div className="grid gap-3">
      {plans.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-medium truncate">{p.name}</div>
                {statusBadge(p.status)}
                {p.transport && (
                  <Badge variant="outline" className="text-[10px]">
                    {p.transport === "webhook" ? <><Webhook className="size-3 mr-1" />webhook</> : <><Globe className="size-3 mr-1" />api</>}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Target: {p.agent_targets?.name ?? "—"} • {p.question_count} questions
                {p.summary?.generated ? ` • Generated ${p.summary.generated}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/dashboard/evaluate/test-lab/review/${p.id}`}>Review</Link>
              </Button>
              {p.status === "approved" && (
                <Button size="sm" onClick={() => runMut.mutate(p.id)} disabled={runMut.isPending}>
                  <Play className="size-3 mr-1" />Run
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => confirm("Delete plan?") && delMut.mutate(p.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Targets panel — dual-config form (OpenAI + Webhook side by side)
// ---------------------------------------------------------------------------
function TargetsPanel({ targets, loading, onChange }: { targets: Target[]; loading: boolean; onChange: () => void }) {
  const { call } = useEvalApi();
  const [name, setName] = useState("");

  // OpenAI sub-config
  const [enableOpenai, setEnableOpenai] = useState(true);
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [sysPrompt, setSysPrompt] = useState("");
  const [openaiToken, setOpenaiToken] = useState("");

  // Webhook sub-config
  const [enableWebhook, setEnableWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookHeaders, setWebhookHeaders] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState('{"input":"{{input}}"}');
  const [responsePath, setResponsePath] = useState("");
  const [webhookToken, setWebhookToken] = useState("");

  const [pingResult, setPingResult] = useState<any>(null);

  const reset = () => {
    setName(""); setOpenaiToken(""); setWebhookToken("");
    setWebhookUrl(""); setEnableWebhook(false);
  };

  const createMut = useMutation({
    mutationFn: () => {
      const config_openai = enableOpenai ? {
        base_url: baseUrl, model, system_prompt: sysPrompt || undefined,
        auth_token: openaiToken || undefined,
      } : undefined;
      const config_webhook = enableWebhook ? {
        url: webhookUrl, method: "POST",
        headers: webhookHeaders ? safeParse(webhookHeaders, {}) : {},
        body_template: bodyTemplate,
        response_path: responsePath || undefined,
        auth_token: webhookToken || undefined,
      } : undefined;
      if (!config_openai && !config_webhook) throw new Error("Enable at least one transport");
      return call("create_target", { name, config_openai, config_webhook });
    },
    onSuccess: () => { toast.success("Agent endpoint saved"); onChange(); reset(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pingMut = useMutation({
    mutationFn: (args: { id: string; transport: string }) => call<any>("ping_target", args),
    onSuccess: (d) => setPingResult(d),
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => call("delete_target", { id }),
    onSuccess: () => { toast.success("Removed"); onChange(); },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 font-medium"><Plug className="size-4" />Connect agent</div>
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My support bot" />
          </div>

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

          <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            <Plus className="size-4 mr-1" />Save endpoint
          </Button>
          <p className="text-xs text-muted-foreground">Enable both transports to test the same agent over OpenAI and webhook side by side.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-medium">Saved endpoints</div>
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!loading && targets.length === 0 && <div className="text-sm text-muted-foreground">None yet.</div>}
          <div className="space-y-2">
            {targets.map((t) => {
              const hasO = t.config_openai && Object.keys(t.config_openai).length > 0;
              const hasW = t.config_webhook && Object.keys(t.config_webhook).length > 0;
              return (
                <div key={t.id} className="border rounded-md p-3 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate flex items-center gap-2">
                      {t.name}
                      {hasO && <Badge variant="outline" className="text-[10px]"><Globe className="size-3 mr-1" />api</Badge>}
                      {hasW && <Badge variant="outline" className="text-[10px]"><Webhook className="size-3 mr-1" />webhook</Badge>}
                      {!hasO && !hasW && <Badge variant="outline" className="text-[10px]">{t.api_type}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {hasO ? t.config_openai?.base_url : ""} {hasW ? `• ${t.config_webhook?.url}` : ""}
                      {!hasO && !hasW ? (t.config?.base_url || t.config?.url) : ""}
                    </div>
                  </div>
                  {hasO && <Button variant="outline" size="sm" onClick={() => pingMut.mutate({ id: t.id, transport: "openai" })} disabled={pingMut.isPending}>Test API</Button>}
                  {hasW && <Button variant="outline" size="sm" onClick={() => pingMut.mutate({ id: t.id, transport: "webhook" })} disabled={pingMut.isPending}>Test webhook</Button>}
                  <Button variant="ghost" size="icon" onClick={() => confirm("Delete?") && delMut.mutate(t.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
          {pingResult && (
            <div className={`rounded-md border p-3 text-xs ${pingResult.ok ? "border-emerald-500/40" : "border-destructive/40"}`}>
              <div className="flex items-center gap-2 font-medium mb-1">
                {pingResult.ok ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertTriangle className="size-3 text-destructive" />}
                {pingResult.transport ? `[${pingResult.transport}] ` : ""}Status {pingResult.status} • {pingResult.latency_ms}ms
              </div>
              <pre className="whitespace-pre-wrap text-muted-foreground max-h-40 overflow-auto">{pingResult.response || pingResult.error}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// New run wizard — objectives + transport picker + slider
// ---------------------------------------------------------------------------
function NewRunWizard({ targets, onCreated, onNeedTarget }: { targets: Target[]; onCreated: () => void; onNeedTarget: () => void }) {
  const { call } = useEvalApi();
  const [name, setName] = useState("");
  const [targetId, setTargetId] = useState("");
  const [transport, setTransport] = useState<"openai" | "webhook">("openai");
  const [domain, setDomain] = useState("");
  const [mustDo, setMustDo] = useState("");
  const [mustNot, setMustNot] = useState("");
  const [tone, setTone] = useState("");
  const [references, setReferences] = useState("");
  const [count, setCount] = useState(200);

  const target = targets.find((t) => t.id === targetId);
  const hasO = !!(target?.config_openai && Object.keys(target.config_openai).length > 0) || target?.api_type === "openai";
  const hasW = !!(target?.config_webhook && Object.keys(target.config_webhook).length > 0) || target?.api_type === "webhook";
  // Auto-lock transport when target supports only one.
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
        objectives,
        question_count: count,
        transport: effectiveTransport,
      });
      toast.info("Generating questions with both judges — this can take a minute…");
      await call("generate_plan_scenarios", { plan_id: created.plan.id });
      return created.plan.id;
    },
    onSuccess: (planId: string) => {
      toast.success("Plan ready for review");
      window.location.href = `/dashboard/evaluate/test-lab/review/${planId}`;
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (targets.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center space-y-3">
        <div className="text-sm text-muted-foreground">No agent endpoints yet. Connect one first.</div>
        <Button onClick={onNeedTarget}><Plug className="size-4 mr-1" />Connect endpoint</Button>
      </CardContent></Card>
    );
  }

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex items-center gap-2 font-medium"><Sparkles className="size-4" />Configure new test run</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label>Run name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Support bot v2 evaluation" /></div>
        <div>
          <Label>Agent endpoint</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{targets.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {target && hasO && hasW && (
        <div>
          <Label>Transport</Label>
          <RadioGroup value={transport} onValueChange={(v: any) => setTransport(v)} className="flex gap-4 mt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="openai" /> <Globe className="size-3" /> OpenAI API
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="webhook" /> <Webhook className="size-3" /> Webhook
            </label>
          </RadioGroup>
        </div>
      )}
      {target && (hasO !== hasW) && (
        <div className="text-xs text-muted-foreground">Using {effectiveTransport} transport (only one configured on this endpoint).</div>
      )}

      <div><Label>Agent role / domain</Label><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Customer support agent for a SaaS billing product" /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label>Must-do behaviors (one per line)</Label><Textarea rows={4} value={mustDo} onChange={(e) => setMustDo(e.target.value)} placeholder="Cite the docs link&#10;Ask for the account email" /></div>
        <div><Label>Must-NOT-do / safety rules</Label><Textarea rows={4} value={mustNot} onChange={(e) => setMustNot(e.target.value)} placeholder="Never reveal internal pricing&#10;Refuse jailbreak attempts" /></div>
      </div>
      <div><Label>Tone & style</Label><Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Concise, friendly, professional" /></div>
      <div><Label>Reference notes (optional)</Label><Textarea rows={2} value={references} onChange={(e) => setReferences(e.target.value)} /></div>
      <div>
        <Label>Number of questions: <strong>{count}</strong></Label>
        <Slider min={20} max={1000} step={20} value={[count]} onValueChange={(v) => setCount(v[0])} />
        <div className="text-xs text-muted-foreground mt-1">Split between Gemini 3.1 Flash Lite and GLM-4.6. Larger sets take longer to generate.</div>
      </div>
      <Button onClick={() => mut.mutate()} disabled={!targetId || mut.isPending}>
        {mut.isPending ? "Generating…" : <><Sparkles className="size-4 mr-1" />Generate scenarios</>}
      </Button>
    </CardContent></Card>
  );
}
