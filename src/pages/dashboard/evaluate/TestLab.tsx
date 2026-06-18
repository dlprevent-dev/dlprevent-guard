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
import { Plug, Sparkles, FlaskConical, Plus, Trash2, Play, CheckCircle2, AlertTriangle } from "lucide-react";
import { useEvalApi } from "@/lib/eval-api";

type Target = { id: string; name: string; api_type: "openai" | "webhook"; config: any; created_at: string };
type Plan = {
  id: string; name: string; status: string; question_count: number;
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
        description="Connect an agent, set objectives, and let the dual-judge ensemble generate, review, run, and score a full evaluation."
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
// Plans list — shows status, lets user review, run, or open report.
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
// Targets panel — connect a user's agent API (OpenAI-compatible or webhook).
// ---------------------------------------------------------------------------
function TargetsPanel({ targets, loading, onChange }: { targets: Target[]; loading: boolean; onChange: () => void }) {
  const { call } = useEvalApi();
  const [name, setName] = useState("");
  const [apiType, setApiType] = useState<"openai" | "webhook">("openai");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [sysPrompt, setSysPrompt] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookHeaders, setWebhookHeaders] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState('{"input":"{{input}}"}');
  const [responsePath, setResponsePath] = useState("output");
  const [pingResult, setPingResult] = useState<any>(null);

  const createMut = useMutation({
    mutationFn: () => {
      const config = apiType === "openai"
        ? { base_url: baseUrl, model, system_prompt: sysPrompt || undefined }
        : {
            url: webhookUrl, method: "POST",
            headers: webhookHeaders ? safeParse(webhookHeaders, {}) : {},
            body_template: bodyTemplate, response_path: responsePath,
          };
      return call("create_target", { name, api_type: apiType, config, auth_token: authToken || null });
    },
    onSuccess: () => {
      toast.success("Agent endpoint saved");
      onChange();
      setName(""); setAuthToken("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pingMut = useMutation({
    mutationFn: (id: string) => call<any>("ping_target", { id }),
    onSuccess: (d) => setPingResult(d),
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => call("delete_target", { id }),
    onSuccess: () => { toast.success("Removed"); onChange(); },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium"><Plug className="size-4" />Connect agent API</div>
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My support bot" />
          </div>
          <div>
            <Label>API type</Label>
            <Select value={apiType} onValueChange={(v: any) => setApiType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI-compatible chat completions</SelectItem>
                <SelectItem value="webhook">Generic HTTP webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {apiType === "openai" ? (
            <>
              <div><Label>Base URL</Label><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></div>
              <div><Label>Model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
              <div><Label>System prompt (optional)</Label><Textarea rows={2} value={sysPrompt} onChange={(e) => setSysPrompt(e.target.value)} /></div>
              <div><Label>Bearer token</Label><Input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder="sk-..." /></div>
            </>
          ) : (
            <>
              <div><Label>URL</Label><Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-agent.example.com/chat" /></div>
              <div><Label>Custom headers (JSON, optional)</Label><Textarea rows={2} value={webhookHeaders} onChange={(e) => setWebhookHeaders(e.target.value)} placeholder='{"X-API-Key":"..."}' /></div>
              <div><Label>Body template — {"{{input}}"} is the user message</Label><Textarea rows={3} value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} /></div>
              <div><Label>Response path (dotted)</Label><Input value={responsePath} onChange={(e) => setResponsePath(e.target.value)} placeholder="data.message or choices.0.message.content" /></div>
              <div><Label>Auth token (optional, sent as Bearer)</Label><Input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} /></div>
            </>
          )}
          <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            <Plus className="size-4 mr-1" />Save endpoint
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-medium">Saved endpoints</div>
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!loading && targets.length === 0 && <div className="text-sm text-muted-foreground">None yet.</div>}
          <div className="space-y-2">
            {targets.map((t) => (
              <div key={t.id} className="border rounded-md p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.api_type} • {t.config?.base_url || t.config?.url}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => pingMut.mutate(t.id)} disabled={pingMut.isPending}>Test</Button>
                <Button variant="ghost" size="icon" onClick={() => confirm("Delete?") && delMut.mutate(t.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          {pingResult && (
            <div className={`rounded-md border p-3 text-xs ${pingResult.ok ? "border-emerald-500/40" : "border-destructive/40"}`}>
              <div className="flex items-center gap-2 font-medium mb-1">
                {pingResult.ok ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertTriangle className="size-3 text-destructive" />}
                Status {pingResult.status} • {pingResult.latency_ms}ms
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
// New run wizard — objectives + slider, then create + generate.
// ---------------------------------------------------------------------------
function NewRunWizard({ targets, onCreated, onNeedTarget }: { targets: Target[]; onCreated: () => void; onNeedTarget: () => void }) {
  const { call } = useEvalApi();
  const [name, setName] = useState("");
  const [targetId, setTargetId] = useState("");
  const [domain, setDomain] = useState("");
  const [mustDo, setMustDo] = useState("");
  const [mustNot, setMustNot] = useState("");
  const [tone, setTone] = useState("");
  const [references, setReferences] = useState("");
  const [count, setCount] = useState(200);

  const mut = useMutation({
    mutationFn: async () => {
      const objectives = {
        domain,
        must_do: mustDo.split("\n").map((s) => s.trim()).filter(Boolean),
        must_not_do: mustNot.split("\n").map((s) => s.trim()).filter(Boolean),
        tone,
        references,
      };
      const created = await call<any>("create_plan", {
        name: name || `Test ${new Date().toLocaleDateString()}`,
        agent_target_id: targetId,
        objectives,
        question_count: count,
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
