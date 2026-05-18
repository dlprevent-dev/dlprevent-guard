import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, ShieldAlert, ShieldCheck, Terminal, KeyRound, Plug, Plus, Clock } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { HelpPanel } from "@/components/help-panel";
import { HelpHint } from "@/components/help-hint";
import { readProxyResponse } from "@/lib/proxy-response";
import { consumePendingReplay, lastUserMessage, type ReplayPayload } from "@/lib/replay";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

// Selection values are namespaced so a key id and an endpoint id can never
// collide in the same <Select>. `key:<id>` selects an AnveGuard key (can send
// requests). `ep:<id>` selects a configured-but-unbound endpoint (cannot
// send — surfaces a "create a key" CTA instead).
type Selection = { kind: "key"; id: string } | { kind: "endpoint"; id: string } | null;
const encodeSel = (s: Selection): string => (s ? `${s.kind}:${s.id}` : "");
const decodeSel = (v: string): Selection => {
  if (!v) return null;
  const [kind, ...rest] = v.split(":");
  const id = rest.join(":");
  if (!id) return null;
  if (kind === "key") return { kind: "key", id };
  if (kind === "ep") return { kind: "endpoint", id };
  return null;
};

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(url).host; } catch { return url; }
}

// Compact "last used" label for keys/endpoints. Returns null when never used.
function formatLastUsed(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${formatDistanceToNowStrict(d, { addSuffix: false })} ago`;
}
function lastUsedTitle(ts: string | null | undefined): string {
  if (!ts) return "Never used";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Never used";
  return `Last used: ${d.toLocaleString()}`;
}

/**
 * REPL-style two-pane Playground: request on the left, live response on
 * the right. Now also lists configured endpoints that have no AnveGuard key
 * yet, with an inline CTA to bind one — so users discover that an endpoint
 * alone isn't enough to send proxy traffic.
 */
const Playground = () => {
  const { call } = useDashboardApi();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: keysData } = useQuery({ queryKey: ["keys"], queryFn: () => call<any>("list_keys") });
  const { data: endpointsData } = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<any>("list_endpoints"),
  });

  const activeKeys: any[] = useMemo(() => {
    const list = (keysData?.keys ?? []).filter((k: any) => k.is_active);
    // Sort by last_used_at desc (never-used sink to bottom) so the most
    // recently active key is always at the top of the picker.
    return [...list].sort((a, b) => {
      const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return tb - ta;
    });
  }, [keysData]);
  const ownedEndpoints: any[] = endpointsData?.endpoints ?? [];
  const sharedEndpoints: any[] = endpointsData?.shared_endpoints ?? [];
  const allEndpoints = [...ownedEndpoints, ...sharedEndpoints];

  // Endpoints the user owns that have no active AnveGuard key bound yet.
  // Shared endpoints are excluded — you can't bind a key to someone else's
  // endpoint from this UI.
  const unboundEndpoints = useMemo(() => {
    const boundIds = new Set(
      activeKeys.map((k) => k.endpoint_id).filter((x: any): x is string => !!x),
    );
    return ownedEndpoints.filter((e) => !boundIds.has(e.id));
  }, [activeKeys, ownedEndpoints]);

  const [selection, setSelection] = useState<Selection>(null);
  const [apiKey, setApiKey] = useState("");
  const [showPasteKey, setShowPasteKey] = useState(false);
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState("Write a haiku about firewalls.");
  const [stream, setStream] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    blocked: boolean;
    text: string;
    reason?: string;
    verdict?: string;
    layers?: any[];
    detectedIntent?: string;
    intentConfidence?: number;
  } | null>(null);

  // Replay banner state — set when arriving from a Logs "Replay in Playground" click.
  const [replay, setReplay] = useState<ReplayPayload | null>(null);

  // Deep-link: /dashboard/playground?key=<id> auto-selects after returning
  // from the New Key flow on the Endpoints/Keys page.
  useEffect(() => {
    const k = searchParams.get("key");
    if (!k) return;
    if (activeKeys.some((x) => x.id === k)) {
      setSelection({ kind: "key", id: k });
      const next = new URLSearchParams(searchParams);
      next.delete("key");
      setSearchParams(next, { replace: true });
    }
  }, [activeKeys, searchParams, setSearchParams]);

  // Replay handoff: consume the sessionStorage payload once on mount,
  // prefill the prompt, auto-select the api_key (if still active), and
  // surface a banner so the user knows they're in replay mode.
  useEffect(() => {
    const r = consumePendingReplay();
    if (!r) return;
    setReplay(r);
    const text = lastUserMessage(r);
    if (text) setPrompt(text);
    if (r.apiKeyId && activeKeys.some((k) => k.id === r.apiKeyId)) {
      setSelection({ kind: "key", id: r.apiKeyId });
    }
    if (r.stream !== undefined) setStream(r.stream);
    if (r.model) setModel(r.model);
    // Clean the `?replay=…` query param so a refresh doesn't look stuck
    // in replay mode after the banner is dismissed.
    const next = new URLSearchParams(searchParams);
    next.delete("replay");
    setSearchParams(next, { replace: true });
  // Run once on mount; intentionally not re-firing on activeKeys changes
  // (the consumed payload is gone, so re-trying after keys load would no-op).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedKey =
    selection?.kind === "key" ? activeKeys.find((k) => k.id === selection.id) : null;
  const selectedEndpoint =
    selection?.kind === "endpoint" ? allEndpoints.find((e) => e.id === selection.id) : null;

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ["models", selectedKey?.id ?? ""],
    queryFn: () =>
      call<{ models: string[]; source: string; warning?: string }>("list_models", {
        body: { api_key_id: selectedKey!.id },
      }),
    enabled: !!selectedKey,
  });
  const availableModels: string[] = modelsData?.models ?? [];

  useEffect(() => {
    if (!selectedKey || availableModels.length === 0) return;
    const def = availableModels.includes(selectedKey.model_default)
      ? selectedKey.model_default
      : availableModels[0];
    setModel(def);
  }, [selectedKey?.id, modelsData]); // eslint-disable-line react-hooks/exhaustive-deps

  const goCreateKeyForEndpoint = (ep: { id: string; name: string }) => {
    const params = new URLSearchParams({
      new: "1",
      endpoint: ep.id,
      name: ep.name,
    });
    navigate(`/dashboard/keys?${params.toString()}`);
  };

  const SAMPLE_TEST_PROMPT = "Reply with the single word: pong.";

  const send = async (opts?: { promptOverride?: string; streamOverride?: boolean; isTest?: boolean }) => {
    if (selection?.kind === "endpoint" && selectedEndpoint) {
      toast.error(
        `"${selectedEndpoint.name}" has no AnveGuard API key bound. Create one to send requests through this endpoint.`,
        {
          action: {
            label: "Create key",
            onClick: () => goCreateKeyForEndpoint(selectedEndpoint),
          },
          duration: 8000,
        },
      );
      return;
    }
    if (selection?.kind !== "key" || !selectedKey) {
      toast.error("Pick an AnveGuard key above to send a request.");
      return;
    }

    // Two auth paths:
    //  - If the user pasted an ag_live_ secret, use it as a real SDK would.
    //  - Otherwise, authenticate as the signed-in dashboard user and let the
    //    proxy resolve the selected key by id (server-side). This avoids
    //    forcing users to re-paste a secret they can't read back.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey.trim().length > 0) {
      if (!apiKey.startsWith("ag_live_")) {
        toast.error("Paste an AnveGuard key (starts with ag_live_) or clear the field to use your dashboard session.");
        return;
      }
      headers.Authorization = `Bearer ${apiKey}`;
    } else {
      const token = await getToken();
      if (!token) {
        toast.error("Sign in again to send through your dashboard session.");
        return;
      }
      headers.Authorization = `Bearer ${token}`;
      headers["x-anveguard-key-id"] = selectedKey.id;
    }

    const effectivePrompt = opts?.promptOverride ?? prompt;
    const effectiveStream = opts?.streamOverride ?? stream;
    setLoading(true);
    setResult({ blocked: false, text: "" });
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: effectivePrompt }],
          stream: effectiveStream,
          ...(model ? { model } : {}),
        }),
      });

      const parsed = await readProxyResponse(res, {
        onDelta: (_chunk, acc) => {
          setResult((prev) => ({
            blocked: prev?.blocked ?? false,
            text: acc,
            reason: prev?.reason,
            verdict: prev?.verdict,
            layers: prev?.layers,
            detectedIntent: prev?.detectedIntent,
            intentConfidence: prev?.intentConfidence,
          }));
        },
        onVerdict: (v) => {
          setResult((prev) => ({
            blocked: v.blocked,
            text: prev?.text ?? "",
            reason: v.reason ?? prev?.reason,
            verdict: v.verdict ?? prev?.verdict,
            layers: v.layers ?? prev?.layers,
            detectedIntent: v.detectedIntent ?? prev?.detectedIntent,
            intentConfidence: v.intentConfidence ?? prev?.intentConfidence,
          }));
        },
      });

      setResult({
        blocked: parsed.blocked,
        text: parsed.text,
        reason: parsed.reason,
        verdict: parsed.verdict,
        layers: parsed.layers,
        detectedIntent: parsed.detectedIntent,
        intentConfidence: parsed.intentConfidence,
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Label rendering: prefer the bound endpoint name over the raw provider
  // string for custom-endpoint keys, so users see "Perplexity (Sonar)"
  // rather than "custom".
  const renderKeyLabel = (k: any) => {
    const right = k.endpoint_name || (k.provider === "custom" ? hostOf(k.custom_base_url) : k.provider);
    return `${k.name} — ${right}`;
  };

  const sendDisabled = loading || selection?.kind !== "key";

  // Reason the Send button is currently disabled (shown inline next to the
  // button so users don't have to guess why nothing happens on click).
  const sendBlockedReason: string | null = (() => {
    if (loading) return null;
    if (selection?.kind === "endpoint" && selectedEndpoint) {
      return `"${selectedEndpoint.name}" has no AnveGuard API key bound — create one to send requests through this endpoint.`;
    }
    if (!selection) {
      if (activeKeys.length === 0 && unboundEndpoints.length > 0) {
        return "Pick an endpoint above and create an AnveGuard key for it to send requests.";
      }
      return "Pick an AnveGuard key above to send a request.";
    }
    return null;
  })();

  // Show the top-of-page warning whenever the user has at least one endpoint
  // configured without a bound AnveGuard key. Previously this only appeared
  // when the user had zero keys total, which hid the explanation as soon as
  // *any* other key existed (e.g. the default Lovable key).
  const showUnboundEndpointsBanner = unboundEndpoints.length > 0;

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-[1320px] mx-auto">
      <PageHeader
        title="Playground"
        description="Send a prompt through your proxy and watch policy decisions live."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => send({ promptOverride: SAMPLE_TEST_PROMPT, streamOverride: false, isTest: true })}
              disabled={sendDisabled}
              size="default"
              title="Send a tiny canned request through the bound endpoint to verify the connection."
            >
              <Plug className="h-4 w-4" />
              {loading ? "Testing…" : "Run test request"}
            </Button>
            <Button onClick={() => send()} disabled={sendDisabled} size="default">
              <Send className="h-4 w-4" />
              {loading ? "Sending…" : "Send through proxy"}
            </Button>
          </div>
        }
      />

      <HelpPanel
        storageKey="playground"
        title="How to use the Playground"
        steps={[
          {
            title: "Pick an AnveGuard key",
            body: "Use the dropdown below. Configured endpoints with no key bound show up too — you'll be prompted to create one in a single click.",
          },
          {
            title: "Paste the key secret",
            body: <>Paste the <code className="font-mono text-xs">ag_live_…</code> value in the AnveGuard API key field. You only see it once at creation, so keep it handy.</>,
          },
          {
            title: "Send or run a quick test",
            body: <><strong>Run test request</strong> fires a tiny canned prompt to verify the upstream connection. <strong>Send through proxy</strong> uses your prompt with full streaming.</>,
          },
          {
            title: "Inspect the verdict",
            body: "The right pane shows the model output plus every policy layer that fired (intent, keywords, behavioral, etc.) so you can debug rules in real time.",
          },
        ]}
        examples={[
          {
            label: "curl example",
            code: `curl -N ${PROXY_URL} \\
  -H 'Authorization: Bearer ag_live_…' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "google/gemini-2.5-flash",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
          },
        ]}
      />

      {showUnboundEndpointsBanner && (
        <Card className="surface-1 border-status-warn/40 bg-status-warn/5">
          <div className="p-5 flex items-start gap-4">
            <div className="rounded-md bg-status-warn/15 text-status-warn p-2 shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body font-medium">
                {unboundEndpoints.length} configured endpoint{unboundEndpoints.length === 1 ? "" : "s"} can't be used yet
              </div>
              <div className="text-meta text-muted-foreground mt-1">
                {unboundEndpoints.length === 1 ? (
                  <>
                    <span className="font-medium text-foreground">"{unboundEndpoints[0].name}"</span> has no AnveGuard API key bound to it.
                    An endpoint by itself is just upstream config — the Playground sends requests using an AnveGuard key, so you need to create one bound to this endpoint before it shows up as a sendable option.
                  </>
                ) : (
                  <>
                    These endpoints have no AnveGuard API key bound to them yet.
                    An endpoint by itself is just upstream config — the Playground sends requests using an AnveGuard key, so you need to create one bound to each endpoint before it shows up as a sendable option.
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {unboundEndpoints.slice(0, 3).map((ep) => (
                  <Button
                    key={ep.id}
                    size="sm"
                    onClick={() => goCreateKeyForEndpoint(ep)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Create key for "{ep.name}"
                  </Button>
                ))}
                {unboundEndpoints.length > 3 && (
                  <span className="text-meta text-muted-foreground self-center">
                    +{unboundEndpoints.length - 3} more in the picker below
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Request pane */}
        <Card className="surface-1 border-border">
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Request</div>
            <Badge variant="outline" className="font-mono">POST /v1/chat/completions</Badge>
          </div>
          <CardContent className="p-5 space-y-4">
            {(activeKeys.length > 0 || unboundEndpoints.length > 0) && (
              <div>
                <Label className="text-meta uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  Key or endpoint
                  <HelpHint>Pick an AnveGuard key to send requests, or pick an unbound endpoint to be guided through creating a key for it.</HelpHint>
                </Label>
                <Select
                  value={encodeSel(selection)}
                  onValueChange={(v) => {
                    setSelection(decodeSel(v));
                    setModel("");
                  }}
                >
                  <SelectTrigger className="mt-1.5 surface-2 border-border">
                    <SelectValue placeholder="Pick a key or endpoint…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeKeys.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Your AnveGuard keys
                        </SelectLabel>
                        {activeKeys.map((k: any) => {
                          const meta: string[] = [];
                          if (k.endpoint_name) meta.push(k.endpoint_name);
                          else if (k.provider === "custom") meta.push(hostOf(k.custom_base_url));
                          else meta.push(k.provider);
                          if (k.model_default) meta.push(k.model_default);
                          if (k.custom_kind) meta.push(k.custom_kind);
                          const fullUrl = k.custom_base_url || "";
                          const lastUsedLabel = formatLastUsed(k.last_used_at);
                          const tooltip = [
                            `Key: ${k.name}`,
                            k.endpoint_name ? `Endpoint: ${k.endpoint_name}` : null,
                            fullUrl ? `URL: ${fullUrl}` : `Provider: ${k.provider}`,
                            k.model_default ? `Default model: ${k.model_default}` : null,
                            lastUsedTitle(k.last_used_at),
                          ].filter(Boolean).join("\n");
                          return (
                            <SelectItem key={`key:${k.id}`} value={`key:${k.id}`} title={tooltip}>
                              <span className="flex flex-col items-start gap-0.5 py-0.5">
                                <span className="flex items-center gap-2 flex-wrap">
                                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium">{k.name}</span>
                                  <span className="font-mono text-[10px] text-muted-foreground">{k.key_prefix}…</span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1.5 h-4 font-normal gap-1 border-border/60 text-muted-foreground"
                                  >
                                    <Clock className="h-2.5 w-2.5" />
                                    {lastUsedLabel ?? "Never used"}
                                  </Badge>
                                </span>
                                <span className="text-[11px] text-muted-foreground pl-5">
                                  {meta.join(" · ")}
                                </span>
                                {fullUrl && (
                                  <span className="text-[10px] text-muted-foreground/70 pl-5 font-mono truncate max-w-[420px]">
                                    {fullUrl}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    )}
                    {unboundEndpoints.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Configured endpoints (no key yet)
                        </SelectLabel>
                    {unboundEndpoints.map((e: any) => {
                          const meta: string[] = [hostOf(e.base_url)];
                          if (e.kind) meta.push(e.kind === "anthropic" ? "anthropic" : "openai-compat");
                          if (e.default_model) meta.push(e.default_model);
                          return (
                            <SelectItem key={`ep:${e.id}`} value={`ep:${e.id}`}>
                              <span className="flex flex-col items-start gap-0.5 py-0.5">
                                <span className="flex items-center gap-2">
                                  <Plug className="h-3.5 w-3.5 text-status-warn" />
                                  <span className="font-medium">{e.name}</span>
                                  <span className="font-mono text-[10px] text-muted-foreground">{meta[0]}</span>
                                </span>
                                <span className="text-[11px] text-muted-foreground pl-5">
                                  {meta.slice(1).join(" · ") || "no model set"}
                                </span>
                                <span className="text-[11px] text-status-warn pl-5">
                                  No AnveGuard key bound — can't send yet
                                </span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>

                {selectedEndpoint && (
                  <div className="mt-3 rounded-md border border-status-warn/40 bg-status-warn/5 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-body">
                      <ShieldAlert className="h-4 w-4 mt-0.5 text-status-warn shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium text-status-warn">
                          Can't send: "{selectedEndpoint.name}" has no AnveGuard key.
                        </div>
                        <div className="text-meta text-muted-foreground mt-0.5">
                          The Playground sends through an AnveGuard key. Create one bound to this endpoint — the upstream provider key you saved on the endpoint will be reused, so you won't need to re-enter it.
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => goCreateKeyForEndpoint(selectedEndpoint)}
                      className="w-full sm:w-auto"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Create AnveGuard key for "{selectedEndpoint.name}"
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="ak" className="text-meta uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                AnveGuard API key
                <HelpHint>Paste the <code className="font-mono">ag_live_…</code> secret. It's only shown once at creation — AnveGuard stores a hash, not the secret.</HelpHint>
              </Label>
              <Input
                id="ak" value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ag_live_…"
                className="mt-1.5 font-mono text-xs surface-2 border-border"
              />
            </div>
            {selectedKey && (
              <div>
                <Label htmlFor="model" className="text-meta uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  Model
                  <HelpHint>Models are fetched live from the upstream provider for this key. The default is whatever you set on the endpoint.</HelpHint>
                </Label>
                <Select value={model} onValueChange={setModel} disabled={modelsLoading || availableModels.length === 0}>
                  <SelectTrigger className="mt-1.5 font-mono text-xs surface-2 border-border">
                    <SelectValue placeholder={modelsLoading ? "Loading models…" : "Pick a model"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {availableModels.map((m) => (
                      <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {replay && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 flex items-start gap-3">
                <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">
                    Replaying log{" "}
                    <code className="font-mono text-[10px] bg-surface-2 px-1 py-0.5 rounded">
                      {replay.logId.slice(0, 12)}
                      {replay.logId.length > 12 ? "…" : ""}
                    </code>
                  </div>
                  <div className="text-meta text-muted-foreground mt-0.5">
                    {replay.originalVerdict && (
                      <>Original verdict: <strong className={
                        replay.originalVerdict === "block" ? "text-status-block" :
                        replay.originalVerdict === "flag" ? "text-status-warn" : "text-status-ok"
                      }>{replay.originalVerdict}</strong>. </>
                    )}
                    {replay.originalBlockReason && (
                      <span className="italic">{replay.originalBlockReason}</span>
                    )}
                    {replay.messages.length > 1 && (
                      <> · Prefilled the last user message; the full {replay.messages.length}-message conversation is not sent — edit or re-run to compare.</>
                    )}
                  </div>
                </div>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setReplay(null)}
                  className="shrink-0 h-7"
                  title="Dismiss replay banner"
                >
                  Dismiss
                </Button>
              </div>
            )}
            <div>
              <Label className="text-meta uppercase tracking-wider text-muted-foreground">Prompt</Label>
              <Textarea
                rows={9} value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mt-1.5 font-mono text-xs surface-2 border-border"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="stream" checked={stream} onCheckedChange={setStream} />
              <Label htmlFor="stream" className="text-body cursor-pointer">Stream tokens</Label>
              <HelpHint>When on, tokens arrive incrementally. Turn off to see the full response and exact upstream JSON in one shot.</HelpHint>
            </div>
          </CardContent>
        </Card>

        {/* Response pane */}
        <Card className="surface-1 border-border">
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Response</div>
            {result ? (
              result.blocked
                ? <Badge status="block">Blocked by admin policy</Badge>
                : <Badge status="ok">allowed</Badge>
            ) : (
              <Badge status="neutral">idle</Badge>
            )}
          </div>
          <CardContent className="p-5">
            {!result ? (
              <EmptyState
                icon={<Terminal className="h-5 w-5" />}
                title="Output will appear here"
                description="Send a request from the left pane to see streaming output and policy results."
              />
            ) : (
              <div className="space-y-3">
                {result.blocked && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
                    <div className="flex items-start gap-2 text-body text-status-block">
                      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">This request was blocked by your organization's AI policy.</div>
                        {result.reason && <div className="text-meta mt-1 opacity-80">{result.reason}</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      <Badge status="block" className="font-mono">verdict: {result.verdict ?? "block"}</Badge>
                      {result.detectedIntent && (
                        <Badge status="info" className="font-mono">
                          intent: {result.detectedIntent}
                          {typeof result.intentConfidence === "number" &&
                            ` · ${(result.intentConfidence * 100).toFixed(0)}%`}
                        </Badge>
                      )}
                    </div>
                    {Array.isArray(result.layers) && result.layers.filter((l: any) => l.verdict !== "allow").length > 0 && (
                      <div className="pl-6 space-y-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fired layers</div>
                        <div className="space-y-1">
                          {result.layers.filter((l: any) => l.verdict !== "allow").map((l: any, i: number) => (
                            <div key={i} className="rounded border border-border bg-surface-2 px-2.5 py-1.5 text-meta">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[11px] text-foreground">
                                  {l.layer}{l.rule ? ` · ${l.rule}` : ""}
                                </span>
                                <Badge
                                  status={l.verdict === "block" ? "block" : "warn"}
                                  className="font-mono text-[10px]"
                                >
                                  {l.verdict}
                                </Badge>
                              </div>
                              {l.reason && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">{l.reason}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <pre className="rounded-md border border-border bg-surface-2 p-4 text-xs whitespace-pre-wrap font-mono leading-relaxed min-h-[280px]">
                  {result.text || (loading ? "▌" : "")}
                </pre>
                {!result.blocked && result.text && (
                  <div className="flex items-center gap-2 text-meta text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-status-ok" />
                    Passed input + output policies
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Playground;
