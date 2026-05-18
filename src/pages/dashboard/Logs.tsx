import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, ShieldAlert, Ban, ShieldCheck, Inbox, Layers, Sparkles, AlertTriangle, CheckCircle2, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardApi } from "@/lib/api";
import { ReplayButton } from "@/components/replay-button";
import { GuidedTour, hasVisitedTour, type TourStep } from "@/components/guided-tour";
import { HelpCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { KeyValue } from "@/components/key-value";
import { EmptyState } from "@/components/empty-state";

// Map a log row to a coarse severity used by Security Events sorting.
// "critical" = blocked_input/blocked_output/throttled, "high" = error,
// "warn" = verdict==="flag", "low" = anything else.
const severityOf = (l: any): "critical" | "high" | "warn" | "low" => {
  if (typeof l.status === "string" && l.status.startsWith("blocked")) return "critical";
  if (l.status === "throttled") return "critical";
  if (l.status === "error") return "high";
  if (l.verdict === "flag") return "warn";
  return "low";
};
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, warn: 2, low: 3 };
const SEVERITY_TONE: Record<string, "block" | "warn" | "ok"> = {
  critical: "block", high: "block", warn: "warn", low: "ok",
};

// Pull a concise rule label out of the persisted verdict_layers array.
const primaryRule = (l: any): string | null => {
  const layers = Array.isArray(l.verdict_layers) ? l.verdict_layers : [];
  const fired = layers.find((x: any) => x?.verdict === "block")
    ?? layers.find((x: any) => x?.verdict === "sanitize")
    ?? layers.find((x: any) => x?.verdict === "flag");
  if (!fired) return null;
  return fired.rule || fired.intent || fired.layer || null;
};

const statusOf = (s: string): "ok" | "warn" | "block" =>
  s === "allowed" ? "ok" : s === "error" ? "warn" : "block";

const auditActionMeta: Record<string, { label: string; icon: typeof Ban }> = {
  // API keys
  "api_key.revoked":               { label: "API key revoked",              icon: Ban },
  "api_key.rotated":               { label: "API key rotated",              icon: Sparkles },
  "api_key.admin_granted":         { label: "Key admin granted",            icon: ShieldCheck },
  "api_key.admin_revoked":         { label: "Key admin revoked",            icon: ShieldAlert },
  // Endpoints
  "endpoint.created":              { label: "Endpoint created",             icon: CheckCircle2 },
  "endpoint.updated":              { label: "Endpoint updated",             icon: ShieldCheck },
  "endpoint.deleted":              { label: "Endpoint deleted",             icon: Ban },
  "endpoint.default_model_set":    { label: "Endpoint default model set",   icon: ShieldCheck },
  "endpoint_share.granted":        { label: "Endpoint share granted",       icon: ShieldCheck },
  "endpoint_share.revoked":        { label: "Endpoint share revoked",       icon: Ban },
  "endpoints.imported":            { label: "Endpoints imported",           icon: CheckCircle2 },
  // Policies
  "policies.updated":              { label: "Legacy policies updated",      icon: ShieldCheck },
  "policy_settings.updated":       { label: "Policy settings updated",      icon: ShieldCheck },
  "policy_rule.created":           { label: "Policy rule created",          icon: CheckCircle2 },
  "policy_rule.updated":           { label: "Policy rule updated",          icon: ShieldCheck },
  "policy_rule.deleted":           { label: "Policy rule deleted",          icon: Ban },
  "policy_intent.upserted":        { label: "Policy intent saved",          icon: ShieldCheck },
  "policy_intent.deleted":         { label: "Policy intent deleted",        icon: Ban },
  "policy_intents.bulk_replaced":  { label: "Policy intents bulk-saved",    icon: ShieldCheck },
  "policy_template.created":       { label: "Policy template created",      icon: CheckCircle2 },
  "policy_template.updated":       { label: "Policy template updated",      icon: ShieldCheck },
  "policy_template.deleted":       { label: "Policy template deleted",      icon: Ban },
  "policy_template.rolled_back":   { label: "Policy template rolled back",  icon: ShieldAlert },
  // Intents catalog
  "known_intent.created":          { label: "Known intent created",         icon: CheckCircle2 },
  "known_intent.updated":          { label: "Known intent updated",         icon: ShieldCheck },
  "known_intent.deleted":          { label: "Known intent deleted",         icon: Ban },
  // Aliases & routes
  "model_alias.created":           { label: "Model alias created",          icon: CheckCircle2 },
  "model_alias.updated":           { label: "Model alias updated",          icon: ShieldCheck },
  "model_alias.deleted":           { label: "Model alias deleted",          icon: Ban },
  "route.upserted":                { label: "Route saved",                  icon: ShieldCheck },
  "route.deleted":                 { label: "Route deleted",                icon: Ban },
  // System prompt + key bulk
  "system_prompt.allowed":         { label: "System prompt allowed",        icon: CheckCircle2 },
  "system_prompt.rejected":        { label: "System prompt rejected",       icon: ShieldAlert },
  // Alert subscriptions (Sprint 9 webhooks)
  "alert_subscription.created":    { label: "Alert subscription created",   icon: CheckCircle2 },
  "alert_subscription.updated":    { label: "Alert subscription updated",   icon: ShieldCheck },
  "alert_subscription.deleted":    { label: "Alert subscription deleted",   icon: Ban },
  "alert_subscription.fired":      { label: "Alert webhook fired",          icon: Sparkles },
  "alert_subscription.fire_failed":{ label: "Alert webhook failed",         icon: AlertTriangle },
  "alert_subscription.test_fired": { label: "Alert test sent",              icon: Sparkles },
  // GDPR / data subject rights (Articles 17, 20, 5(1)(e))
  "data.exported":                 { label: "Data exported (Article 20)",   icon: ShieldCheck },
  "data.deletion_requested":      { label: "Account deletion requested",   icon: ShieldAlert },
  "data.retention_updated":       { label: "Log retention updated",        icon: ShieldCheck },
  "data.logs_pruned":             { label: "Logs pruned",                  icon: Flame },
};

// Shared 6-column grid template so the Requests + Audit tabs visually align.
const requestsCols = "grid-cols-[150px_minmax(0,1fr)_140px_82px_104px_92px]";
const auditCols = "grid-cols-[160px_220px_minmax(0,1fr)_160px]";

const STATUS_PILLS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "allowed", label: "Allowed" },
  { id: "blocked_input", label: "Blocked (input)" },
  { id: "blocked_output", label: "Blocked (output)" },
  { id: "error", label: "Error" },
];

const RequestLogs = () => {
  const { call } = useDashboardApi();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<any>(null);
  const [live, setLive] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["logs", status],
    queryFn: () => call<any>("list_logs", { query: { status, limit: "200" } }),
    refetchInterval: live ? 5_000 : false,
  });

  // Deep-link: when the global ⌘K palette navigates here with `?focus=<id>`,
  // auto-open that log's detail sheet once the data has loaded, then strip
  // the param so a refresh doesn't re-trigger it.
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: respect `?status=blocked_input` (used by Overview alerts) so
  // operators land directly on the filtered view they expected.
  useEffect(() => {
    const s = searchParams.get("status");
    if (s && s !== status) setStatus(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const focusId = searchParams.get("focus");
    if (!focusId || !data?.logs) return;
    const hit = data.logs.find((l: any) => l.id === focusId);
    if (hit) {
      setSelected(hit);
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  }, [data, searchParams, setSearchParams]);

  const filtered = (data?.logs ?? []).filter((l: any) => {
    if (!q) return true;
    return JSON.stringify(l.messages ?? "").toLowerCase().includes(q.toLowerCase());
  });

  const promptOf = (l: any) =>
    (l.messages?.[l.messages.length - 1]?.content ?? "").toString();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-9 surface-2 border-border"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-0.5">
          {STATUS_PILLS.map((p) => (
            <button
              key={p.id}
              onClick={() => setStatus(p.id)}
              className={`h-7 px-2.5 text-meta rounded transition-colors ${
                status === p.id
                  ? "bg-surface-1 text-foreground shadow-pop"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setLive((v) => !v)}
          className={`inline-flex items-center gap-2 h-9 px-3 rounded-md border text-meta transition-colors ${
            live
              ? "border-status-ok/40 bg-status-ok/10 text-foreground"
              : "border-border surface-2 text-muted-foreground hover:text-foreground"
          }`}
          title="Auto-refresh every 5s"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-status-ok live-pulse" : "bg-muted-foreground"}`} />
          {live ? (isFetching ? "Live · syncing" : "Live") : "Live"}
        </button>
      </div>


      <Card className="surface-1 border-border overflow-hidden">
        {/* Mobile: horizontal scroll preserves dense column layout. */}
        <div className="overflow-x-auto">
        <div className="min-w-[760px]">
        <div className={`grid ${requestsCols} gap-3 px-4 h-9 items-center border-b border-border bg-surface-2/60 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.1em]`}>
          <div>Time</div><div>Prompt</div><div>Key</div><div className="text-right">Latency</div><div className="text-right">Tokens</div><div>Status</div>
        </div>
        {isLoading ? (
          <SkeletonRows rows={8} cols={requestsCols} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="No requests match your filters"
            description="Try a wider time range or clear the prompt search."
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((l: any) => {
              const isBlocked = l.status?.startsWith("blocked");
              return (
                <li key={l.id}>
                  <button
                    onClick={() => setSelected(l)}
                    className={`w-full grid ${requestsCols} gap-3 px-4 h-9 items-center text-left transition-colors hover:bg-surface-2`}
                  >
                    <span className="text-meta text-muted-foreground font-mono tabular-nums">
                      {new Date(l.created_at).toLocaleString()}
                    </span>
                    <span className="text-body truncate flex items-center gap-2 min-w-0">
                      {isBlocked && <ShieldAlert className="h-3.5 w-3.5 text-status-block shrink-0" />}
                      <span className="truncate">{promptOf(l) || "—"}</span>
                    </span>
                    <span className="text-meta text-muted-foreground font-mono truncate">{l.api_key_name}</span>
                    <span className="text-meta tabular-nums text-right">{l.latency_ms ?? 0}ms</span>
                    <span className="text-meta tabular-nums text-right text-muted-foreground">
                      {l.tokens_in ?? "—"}/{l.tokens_out ?? "—"}
                    </span>
                    <Badge status={statusOf(l.status)}>{l.status}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Request detail
                  <Badge status={statusOf(selected.status)}>{selected.status}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-body">
                <div className="grid grid-cols-2 gap-4">
                  <KeyValue label="Time" mono={false}>{new Date(selected.created_at).toLocaleString()}</KeyValue>
                  <KeyValue label="Latency">{selected.latency_ms ?? 0}ms</KeyValue>
                  <KeyValue label="Provider" mono={false}>{selected.provider}</KeyValue>
                  <KeyValue label="Model">{selected.model}</KeyValue>
                  <KeyValue label="Tokens in">{selected.tokens_in ?? "—"}</KeyValue>
                  <KeyValue label="Tokens out">{selected.tokens_out ?? "—"}</KeyValue>
                </div>
                {(selected.block_reason || selected.status?.startsWith("blocked")) && (
                  <BlockReasonBlock log={selected} />
                )}
                <PolicyVerdictPanel log={selected} />
                <Tabs defaultValue="pretty">
                  <TabsList className="bg-surface-2 border border-border h-8 p-0.5">
                    <TabsTrigger value="pretty" className="h-7 px-2.5 text-meta data-[state=active]:bg-surface-1">Pretty</TabsTrigger>
                    <TabsTrigger value="raw" className="h-7 px-2.5 text-meta data-[state=active]:bg-surface-1">Raw JSON</TabsTrigger>
                  </TabsList>
                  <TabsContent value="pretty" className="space-y-3 mt-3">
                    {(selected.guardrail_prompt || selected.client_system_prompt) && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                          Injected system prompts
                        </div>
                        <div className="space-y-2">
                          {selected.guardrail_prompt && (
                            <div className="rounded-md border border-border bg-surface-2 p-3">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                Workspace guardrail
                              </div>
                              <pre className="text-xs whitespace-pre-wrap break-words">{selected.guardrail_prompt}</pre>
                            </div>
                          )}
                          {selected.client_system_prompt && (
                            <div className="rounded-md border border-border bg-surface-2 p-3">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                Client system_prompt (admin key)
                              </div>
                              <pre className="text-xs whitespace-pre-wrap break-words">{selected.client_system_prompt}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Messages</div>
                        <ReplayButton row={selected} size="sm" variant="outline" />
                      </div>
                      <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(selected.messages, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Response</div>
                      <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(selected.response, null, 2)}
                      </pre>
                    </div>
                  </TabsContent>
                  <TabsContent value="raw" className="mt-3">
                    <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(selected, null, 2)}
                    </pre>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

// ---- Per-request policy verdict panel ------------------------------------
// Surfaces the per-layer breakdown the proxy persisted in `verdict_layers`
// (especially behavioral signals: instruction_churn, roleplay_escalation,
// encoding_escalation, length_spike) so an operator can understand WHY a
// given conversation was flagged or blocked without diving into raw JSON.

type LayerEntry = {
  layer: string;
  verdict: string;
  rule?: string | null;
  reason?: string | null;
  intent?: string | null;
  confidence?: number | null;
  matched?: string | null;
};

const VERDICT_TONE: Record<string, string> = {
  block: "border-destructive/40 text-destructive bg-destructive/10",
  sanitize: "border-amber-500/40 text-amber-500 bg-amber-500/10",
  flag: "border-amber-500/40 text-amber-500 bg-amber-500/10",
  allow: "border-emerald-500/40 text-emerald-500 bg-emerald-500/10",
  throttled: "border-destructive/40 text-destructive bg-destructive/10",
};

const LAYER_LABELS: Record<string, string> = {
  keywords: "Keywords",
  patterns: "Pattern rules",
  heuristics: "Heuristics",
  intent: "Intent classifier",
  injection: "Injection guard",
  behavioral: "Behavioral",
};

function PolicyVerdictPanel({ log }: { log: any }) {
  const verdict: string | null = log.verdict ?? null;
  const rawLayers = Array.isArray(log.verdict_layers) ? log.verdict_layers : [];
  const layers: LayerEntry[] = rawLayers.map((l: any) => ({
    layer: String(l?.layer ?? "unknown"),
    verdict: String(l?.verdict ?? "allow"),
    rule: l?.rule ?? null,
    reason: l?.reason ?? null,
    intent: l?.intent ?? null,
    confidence: typeof l?.confidence === "number" ? l.confidence : null,
    matched: l?.matched ?? null,
  }));
  const fired = layers.filter((l) => l.verdict !== "allow");
  const behavioral = fired.filter((l) => l.layer === "behavioral");

  // Nothing meaningful to show — skip the panel entirely.
  // Intent is now always present (defaults to "unknown" on every proxied
  // call), so the panel is meaningful as long as we have either a verdict,
  // fired layers, or any non-null intent value (including "unknown").
  const intentLabel = log.detected_intent ?? "unknown";
  if (!verdict && fired.length === 0 && !log.detected_intent) return null;

  const Icon =
    verdict === "allow" ? ShieldCheck :
    verdict === "flag" ? AlertTriangle :
    ShieldAlert;

  return (
    <div className="rounded-md border border-border surface-2 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4",
            verdict === "allow" && "text-emerald-500",
            verdict === "flag" && "text-amber-500",
            (verdict === "block" || verdict === "sanitize" || !verdict) && "text-destructive",
          )} />
          <span className="text-meta font-medium">Policy verdict</span>
          {verdict && (
            <Badge variant="outline" className={cn("font-mono text-[10px]", VERDICT_TONE[verdict] ?? "")}>
              {verdict}
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Layers className="h-3 w-3" /> {fired.length} fired / {layers.length} ran
        </span>
      </div>

      <div className="rounded border border-border bg-surface-1 p-2 text-meta flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Detected intent:</span>
          <code className={cn(
            "rounded bg-muted px-1 py-0.5 text-[11px]",
            intentLabel === "unknown" && "text-muted-foreground italic",
          )}>
            {intentLabel}
          </code>
        </div>
        {typeof log.intent_confidence === "number" && (
          <span className="text-[11px] text-muted-foreground">
            conf {Math.round(log.intent_confidence * 100)}%
          </span>
        )}
      </div>

      {behavioral.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Behavioral signals
          </div>
          {behavioral.map((l, i) => (
            <LayerRow key={`b-${i}`} entry={l} />
          ))}
        </div>
      )}

      {fired.filter((l) => l.layer !== "behavioral").length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Other layers
          </div>
          {fired.filter((l) => l.layer !== "behavioral").map((l, i) => (
            <LayerRow key={`o-${i}`} entry={l} />
          ))}
        </div>
      )}

      {fired.length === 0 && (
        <div className="text-meta text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> All layers allowed this request.
        </div>
      )}
    </div>
  );
}

function LayerRow({ entry: l }: { entry: LayerEntry }) {
  const label = LAYER_LABELS[l.layer] ?? l.layer;
  return (
    <div className="rounded border border-border bg-surface-1 p-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-meta font-medium">{label}</span>
          {l.rule && (
            <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground truncate">
              {l.rule}
            </code>
          )}
          {l.intent && (
            <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              {l.intent}
            </code>
          )}
        </div>
        <Badge variant="outline" className={cn("font-mono text-[10px]", VERDICT_TONE[l.verdict] ?? "")}>
          {l.verdict}
        </Badge>
      </div>
      {l.reason && <div className="text-meta text-muted-foreground">{l.reason}</div>}
      {l.confidence != null && (
        <div className="text-[11px] text-muted-foreground">
          confidence {Math.round(l.confidence * 100)}%
        </div>
      )}
    </div>
  );
}

// ---- Reason for block — compact, prominent summary ----------------------
function BlockReasonBlock({ log }: { log: any }) {
  const layers: any[] = Array.isArray(log.verdict_layers) ? log.verdict_layers : [];
  const fired = layers.find((l) => l?.verdict === "block")
    ?? layers.find((l) => l?.verdict === "sanitize")
    ?? layers.find((l) => l?.verdict === "flag")
    ?? null;
  const reason = log.block_reason ?? fired?.reason ?? "Blocked by policy";
  const rule = fired?.rule ?? fired?.intent ?? null;
  const matched = fired?.matched ?? null;
  const policyName = fired ? (LAYER_LABELS[fired.layer] ?? fired.layer) : null;

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Ban className="h-3.5 w-3.5 text-status-block" />
        <span className="text-meta font-medium text-status-block">Reason for block</span>
      </div>
      <div className="text-body text-foreground">{reason}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <ReasonCell label="Rule" value={rule} />
        <ReasonCell label="Keyword" value={matched} mono />
        <ReasonCell label="Policy" value={policyName} />
      </div>
    </div>
  );
}

function ReasonCell({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="rounded border border-border bg-surface-1 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-meta truncate", mono && "font-mono")}>{value ?? "—"}</div>
    </div>
  );
}

// ---- Security Events — blocked-only, severity-sorted view ----------------
const securityCols = "grid-cols-[140px_92px_minmax(0,1fr)_180px_120px]";

const SecurityEvents = () => {
  const { call } = useDashboardApi();
  const [q, setQ] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["security_events"],
    queryFn: () => call<any>("list_logs", { query: { limit: "500" } }),
    refetchInterval: 15_000,
  });

  const events = useMemo(() => {
    const all = (data?.logs ?? []).filter((l: any) => {
      const s = severityOf(l);
      return s === "critical" || s === "warn";
    });
    const filtered = all.filter((l: any) => {
      if (severityFilter !== "all" && severityOf(l) !== severityFilter) return false;
      if (!q) return true;
      const hay = JSON.stringify(l.messages ?? "") + " " + (l.block_reason ?? "") + " " + (primaryRule(l) ?? "");
      return hay.toLowerCase().includes(q.toLowerCase());
    });
    return filtered.sort((a: any, b: any) => {
      const r = SEVERITY_RANK[severityOf(a)] - SEVERITY_RANK[severityOf(b)];
      if (r !== 0) return r;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data, q, severityFilter]);

  const counts = useMemo(() => {
    const c = { critical: 0, warn: 0 };
    for (const l of data?.logs ?? []) {
      const s = severityOf(l);
      if (s === "critical") c.critical++;
      else if (s === "warn") c.warn++;
    }
    return c;
  }, [data]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <SecStat label="Critical events" value={counts.critical} tone="block" icon={<Flame className="h-4 w-4" />} />
        <SecStat label="Warnings (flagged)" value={counts.warn} tone="warn" icon={<AlertTriangle className="h-4 w-4" />} />
        <SecStat label="Total events" value={counts.critical + counts.warn} tone="info" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts, rules, reasons…"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-9 surface-2 border-border"
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-44 h-9 surface-2 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical only</SelectItem>
            <SelectItem value="warn">Warnings only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="surface-1 border-border overflow-hidden">
        <div className="overflow-x-auto">
        <div className="min-w-[840px]">
        <div className={`grid ${securityCols} gap-3 px-4 h-9 items-center border-b border-border bg-surface-2/60 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.1em]`}>
          <div>Time</div><div>Severity</div><div>Reason</div><div>Rule</div><div>Status</div>
        </div>
        {isLoading ? (
          <SkeletonRows rows={8} cols={securityCols} />
        ) : events.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No security events"
            description="No blocked or flagged requests in the last 500 entries. Nice."
          />
        ) : (
          <ul className="divide-y divide-border">
            {events.map((l: any) => {
              const sev = severityOf(l);
              const rule = primaryRule(l);
              const reason = l.block_reason
                ?? (l.messages?.[l.messages.length - 1]?.content ?? "").toString();
              return (
                <li key={l.id}>
                  <button
                    onClick={() => setSelected(l)}
                    className={`w-full grid ${securityCols} gap-3 px-4 h-9 items-center text-left transition-colors hover:bg-surface-2`}
                  >
                    <span className="text-meta text-muted-foreground font-mono tabular-nums">
                      {new Date(l.created_at).toLocaleString()}
                    </span>
                    <Badge status={SEVERITY_TONE[sev]}>{sev}</Badge>
                    <span className="text-body truncate">{reason || "—"}</span>
                    <span className="text-meta text-muted-foreground font-mono truncate">{rule ?? "—"}</span>
                    <Badge status={statusOf(l.status)}>{l.status}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Security event
                  <Badge status={statusOf(selected.status)}>{selected.status}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-body">
                <div className="grid grid-cols-2 gap-4">
                  <KeyValue label="Time" mono={false}>{new Date(selected.created_at).toLocaleString()}</KeyValue>
                  <KeyValue label="Latency">{selected.latency_ms ?? 0}ms</KeyValue>
                  <KeyValue label="Provider" mono={false}>{selected.provider}</KeyValue>
                  <KeyValue label="Model">{selected.model}</KeyValue>
                </div>
                <BlockReasonBlock log={selected} />
                <PolicyVerdictPanel log={selected} />
                {(selected.guardrail_prompt || selected.client_system_prompt) && (
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Injected system prompts
                    </div>
                    {selected.guardrail_prompt && (
                      <div className="rounded-md border border-border bg-surface-2 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Workspace guardrail</div>
                        <pre className="text-xs whitespace-pre-wrap break-words">{selected.guardrail_prompt}</pre>
                      </div>
                    )}
                    {selected.client_system_prompt && (
                      <div className="rounded-md border border-border bg-surface-2 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Client system_prompt</div>
                        <pre className="text-xs whitespace-pre-wrap break-words">{selected.client_system_prompt}</pre>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Input</div>
                    <ReplayButton row={selected} size="sm" variant="outline" />
                  </div>
                  <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(selected.messages, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Output</div>
                  <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(selected.response, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

const SecStat = ({ label, value, tone, icon }: {
  label: string; value: number; tone: "block" | "warn" | "info"; icon: React.ReactNode;
}) => (
  <Card className="surface-1 border-border p-4">
    <div className="flex items-center justify-between">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <span className={cn(
        "h-6 w-6 rounded-md flex items-center justify-center",
        tone === "block" && "bg-destructive/10 text-status-block",
        tone === "warn" && "bg-amber-500/10 text-amber-500",
        tone === "info" && "bg-primary/10 text-primary",
      )}>{icon}</span>
    </div>
    <div className="text-display font-semibold tabular-nums tracking-tight mt-1">{value.toLocaleString()}</div>
  </Card>
);


const AuditLog = () => {
  const { call } = useDashboardApi();
  const [action, setAction] = useState<string>("all");
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit_logs", action],
    queryFn: () => call<any>("list_audit_logs", { query: { action, limit: "200" } }),
  });

  const entries = data?.entries ?? [];

  return (
    <>
      <div className="flex gap-2">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-64 h-9 surface-2 border-border"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-[60vh]">
            <SelectItem value="all">All actions</SelectItem>
            {/* Generated from auditActionMeta so the filter stays in sync
                with whatever verbs the backend actually emits — adding a
                new audit verb only requires editing one map above. */}
            {Object.entries(auditActionMeta)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="surface-1 border-border overflow-hidden">
        <div className="overflow-x-auto">
        <div className="min-w-[720px]">
        <div className={`grid ${auditCols} gap-3 px-4 h-9 items-center border-b border-border bg-surface-2/60 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.1em]`}>
          <div>Time</div><div>Action</div><div>Target</div><div>Actor</div>
        </div>
        {isLoading ? (
          <SkeletonRows rows={6} cols={auditCols} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No audit entries yet"
            description="Account-level actions like key revocations will appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e: any) => {
              const meta = auditActionMeta[e.action] ?? { label: e.action, icon: ShieldCheck };
              const Icon = meta.icon;
              const isSysPrompt = e.action?.startsWith("system_prompt.");
              const target = isSysPrompt
                // For system_prompt rows, surface the failing gate + code so
                // operators can scan the list without opening every entry.
                ? `${e.metadata?.gate ?? "—"} · ${e.metadata?.code ?? "—"}${
                    e.metadata?.prompt_length != null ? ` · ${e.metadata.prompt_length} chars` : ""
                  }`
                : e.metadata?.key_name
                  ? `${e.metadata.key_name} (${e.metadata.key_prefix ?? "—"}…)`
                  : e.target_id ?? "—";
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setSelected(e)}
                    className={`w-full grid ${auditCols} gap-3 px-4 h-9 items-center text-left transition-colors hover:bg-surface-2`}
                  >
                    <span className="text-meta text-muted-foreground font-mono tabular-nums">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                    <Badge status="info" className="w-fit">
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                    <span className="text-body truncate">{target}</span>
                    <span className="text-meta text-muted-foreground truncate font-mono">{e.actor_user_id}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader><SheetTitle>Audit entry</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-5 text-body">
                <div className="grid grid-cols-2 gap-4">
                  <KeyValue label="Time" mono={false}>{new Date(selected.created_at).toLocaleString()}</KeyValue>
                  <KeyValue label="Action">{selected.action}</KeyValue>
                  <KeyValue label="Target type" mono={false}>{selected.target_type}</KeyValue>
                  <KeyValue label="Target id">{selected.target_id ?? "—"}</KeyValue>
                  <KeyValue label="Actor" className="col-span-2">{selected.actor_user_id}</KeyValue>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Metadata</div>
                  <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

const Logs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "security"
    || searchParams.get("tab") === "audit" ? searchParams.get("tab")! : "requests";
  const [tab, setTab] = useState<string>(initialTab);
  const [tourOpen, setTourOpen] = useState(false);

  // Auto-open the tour on the first ever visit to this page.
  useEffect(() => {
    if (!hasVisitedTour("logs-v1")) {
      // Tiny delay so layout settles + targets exist before measurement.
      const t = setTimeout(() => setTourOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  const tourSteps: TourStep[] = [
    {
      selector: '[data-tour="logs-tabs"]',
      title: "Three views, one source",
      body: "Every proxied request lives here. Requests is the firehose, Security events filters to just blocks/flags/throttles, Audit log is admin actions (key created, policy changed, etc).",
      placement: "bottom",
    },
    {
      selector: '[data-tour="logs-tab-security"]',
      title: "Jump straight to threats",
      body: "When something looks wrong, this tab surfaces only the requests the engine blocked, flagged, or throttled — sorted by severity.",
      placement: "bottom",
    },
    {
      selector: '[data-tour="logs-help"]',
      title: "Re-take this tour anytime",
      body: "Click here to replay this walkthrough — useful after the dashboard ships new surfaces, or when you're showing AnveGuard to a teammate.",
      placement: "bottom",
    },
  ];

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-[1320px] mx-auto">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Logs"
          description="Request traffic, security events, and account-level audit."
        />
        <Button
          variant="outline" size="sm"
          onClick={() => setTourOpen(true)}
          data-tour="logs-help"
          className="shrink-0 mt-1"
          title="Take a guided tour of this page"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Tour
        </Button>
      </div>

      <GuidedTour
        id="logs-v1"
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        steps={tourSteps}
        finishLabel="Got it"
      />

      <Tabs value={tab} onValueChange={(v) => {
        setTab(v);
        const next = new URLSearchParams(searchParams);
        if (v === "requests") next.delete("tab"); else next.set("tab", v);
        setSearchParams(next, { replace: true });
      }} className="space-y-4">
        <TabsList data-tour="logs-tabs" className="bg-surface-2 border border-border h-9 p-0.5">
          <TabsTrigger value="requests" className="h-8 px-3 text-body data-[state=active]:bg-surface-1 data-[state=active]:shadow-pop">
            Requests
          </TabsTrigger>
          <TabsTrigger value="security" data-tour="logs-tab-security" className="h-8 px-3 text-body data-[state=active]:bg-surface-1 data-[state=active]:shadow-pop">
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" /> Security events
          </TabsTrigger>
          <TabsTrigger value="audit" className="h-8 px-3 text-body data-[state=active]:bg-surface-1 data-[state=active]:shadow-pop">
            Audit log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="space-y-4 animate-fade-in">
          <RequestLogs />
        </TabsContent>
        <TabsContent value="security" className="space-y-4 animate-fade-in">
          <SecurityEvents />
        </TabsContent>
        <TabsContent value="audit" className="space-y-4 animate-fade-in">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Logs;
