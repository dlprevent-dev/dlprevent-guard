import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Plus, Trash2, Check, X, Plug, Beaker, Loader2, KeyRound, Tags, Code2, Play, ShieldAlert, ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import { HelpPanel } from "@/components/help-panel";
import { HelpHint } from "@/components/help-hint";
import { AliasesSheet } from "@/components/aliases-sheet";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

interface ProviderDef {
  id: string; label: string; managed?: boolean;
  default_model: string; model_suggestions: string[];
  key_placeholder: string; get_key_url: string;
}
interface CustomSchema {
  kinds: { id: string; label: string }[];
  auth_schemes: { id: string; label: string }[];
  templates: {
    id: string; label: string;
    values: {
      kind: string; base_url: string; auth_scheme: string;
      auth_header?: string; default_model: string; model_suggestions: string;
    };
  }[];
}

interface CustomState {
  template: string;
  kind: string;
  base_url: string;
  models_url: string;
  auth_scheme: string;
  auth_header: string;
  model_suggestions: string;
  extra_headers: { key: string; value: string }[];
}

const emptyCustom: CustomState = {
  template: "",
  kind: "openai_compatible",
  base_url: "",
  models_url: "",
  auth_scheme: "bearer",
  auth_header: "Authorization",
  model_suggestions: "",
  extra_headers: [],
};

const Keys = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["keys"], queryFn: () => call<any>("list_keys") });
  // Alias counts per key — drives the "+N models" badge that distinguishes
  // 1:1 keys from N:1 unified-gateway keys at a glance.
  const { data: aliasData } = useQuery({
    queryKey: ["aliases", "all"],
    queryFn: () => call<{ aliases: { api_key_id: string }[] }>("list_aliases"),
  });
  const aliasCountByKey = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of aliasData?.aliases ?? []) m[a.api_key_id] = (m[a.api_key_id] ?? 0) + 1;
    return m;
  }, [aliasData]);
  const { data: provData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => call<{ providers: ProviderDef[]; custom_schema: CustomSchema }>("list_providers"),
  });
  const providers = provData?.providers ?? [];
  const customSchema = provData?.custom_schema;

  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyId, setNewKeyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState<string>("lovable");
  const [model, setModel] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [custom, setCustom] = useState<CustomState>(emptyCustom);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // Endpoint to bind the new key to. Set when arriving from the Endpoints
  // "Create replacement key" shortcut (URL has ?endpoint=<id>). Sent through
  // to `create_key` so the new key is bound to the same custom endpoint as
  // the one being revoked.
  const [prefilledEndpointId, setPrefilledEndpointId] = useState<string | null>(null);
  const [aliasesFor, setAliasesFor] = useState<{ id: string; name: string } | null>(null);
  const [integrateFor, setIntegrateFor] = useState<{ id: string; name: string; key_prefix: string } | null>(null);

  // ---- Deep-link: open the New Key dialog from a URL like
  //      /dashboard/keys?new=1&name=foo&endpoint=<uuid>
  // Used by the "Create replacement key" shortcut in the Revoke confirm
  // dialog so users can rotate a lost/compromised key in one click.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const prefName = searchParams.get("name") ?? "";
    const prefEndpoint = searchParams.get("endpoint");
    if (prefName) setName(prefName);
    if (prefEndpoint) setPrefilledEndpointId(prefEndpoint);
    setOpen(true);
    // Strip the params so a refresh doesn't re-open the dialog and the URL
    // stays clean once the user starts editing.
    const next = new URLSearchParams(searchParams);
    next.delete("new"); next.delete("name"); next.delete("endpoint");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link from the global ⌘K palette: `?focus=<key_id>` scrolls the
  // matching row into view and flashes a ring highlight for ~1.6s. We watch
  // both the param and the loaded list so this works whether the data is
  // already cached or arrives later.
  const [focusKeyId, setFocusKeyId] = useState<string | null>(null);
  useEffect(() => {
    const focusId = searchParams.get("focus");
    if (!focusId || !data?.keys) return;
    const exists = data.keys.some((k: any) => k.id === focusId);
    if (!exists) return;
    setFocusKeyId(focusId);
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
    // Defer scroll until the row has rendered with the highlight class.
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-key-row="${focusId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const t = setTimeout(() => setFocusKeyId(null), 1600);
    return () => clearTimeout(t);
  }, [data, searchParams, setSearchParams]);

  const selected = providers.find((p) => p.id === providerId);
  const isCustom = providerId === "custom";

  const onProviderChange = (id: string) => {
    setProviderId(id);
    const def = providers.find((p) => p.id === id);
    setModel(def?.default_model ?? "");
    setProviderKey("");
    setCustom(emptyCustom);
    setTestResult(null);
  };

  const applyTemplate = (templateId: string) => {
    const t = customSchema?.templates.find((x) => x.id === templateId);
    if (!t) return;
    setCustom((c) => ({
      ...c,
      template: templateId,
      kind: t.values.kind,
      base_url: t.values.base_url,
      auth_scheme: t.values.auth_scheme,
      auth_header: t.values.auth_header || "Authorization",
      model_suggestions: t.values.model_suggestions,
    }));
    if (t.values.default_model) setModel(t.values.default_model);
    setTestResult(null);
  };

  const customPayload = useMemo(() => {
    const extra: Record<string, string> = {};
    for (const h of custom.extra_headers) {
      if (h.key.trim() && h.value.trim()) extra[h.key.trim()] = h.value.trim();
    }
    return {
      base_url: custom.base_url.trim(),
      models_url: custom.models_url.trim() || undefined,
      kind: custom.kind,
      auth_scheme: custom.auth_scheme,
      auth_header: custom.auth_header.trim() || "Authorization",
      extra_headers: extra,
      model_suggestions: custom.model_suggestions
        .split(",").map((s) => s.trim()).filter(Boolean),
    };
  }, [custom]);

  const testCustom = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await call<any>("test_custom_endpoint", {
        body: { ...customPayload, provider_key: providerKey || undefined },
      });
      if (r.ok) {
        setTestResult({ ok: true, msg: r.sample_model
            ? `Connected. Sample model: ${r.sample_model}`
            : `Connected (${r.status}).` });
      } else {
        setTestResult({ ok: false, msg: r.error || `HTTP ${r.status}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const create = useMutation({
    mutationFn: () => call<any>("create_key", {
      body: {
        name,
        provider: providerId,
        model: model || selected?.default_model,
        provider_key: providerKey || undefined,
        custom: isCustom ? customPayload : undefined,
        // Bind to the same custom endpoint as the key being replaced when
        // the user arrived via the "Create replacement key" shortcut.
        endpoint_id: prefilledEndpointId ?? undefined,
      },
    }),
    onSuccess: (res) => { setNewKey(res.full_key); setNewKeyId(res.id ?? null); qc.invalidateQueries({ queryKey: ["keys"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => call("revoke_key", { body: { id } }),
    onSuccess: () => { toast.success("Key revoked"); qc.invalidateQueries({ queryKey: ["keys"] }); },
  });
  // Toggle the per-key admin flag. Admin keys are the only ones allowed to
  // pass a custom `system_prompt` alongside the workspace guardrail; everyone
  // else is rejected at the proxy with 403.
  const setKeyAdmin = useMutation({
    mutationFn: ({ id, is_admin }: { id: string; is_admin: boolean }) =>
      call("set_key_admin", { body: { id, is_admin } }),
    onSuccess: (_r, vars) => {
      toast.success(vars.is_admin ? "Admin permission granted" : "Admin permission revoked");
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ---- Bulk admin permission toggle --------------------------------------
  // Lets operators flip many keys at once (e.g. revoke `system_prompt` rights
  // across an entire team). Selection is held in a Set keyed by key id and
  // wiped after a successful bulk write so the next selection starts clean.
  const [selectedKeyIds, setSelectedKeyIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => {
    setSelectedKeyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const bulkSetAdmin = useMutation({
    mutationFn: ({ ids, is_admin }: { ids: string[]; is_admin: boolean }) =>
      call<{ updated: number; unchanged: number }>("bulk_set_key_admin", { body: { ids, is_admin } }),
    onSuccess: (r, vars) => {
      const action = vars.is_admin ? "granted" : "revoked";
      const skipped = r?.unchanged ? ` · ${r.unchanged} already ${action.replace("ed", "ed")}` : "";
      toast.success(`${r?.updated ?? 0} key${(r?.updated ?? 0) === 1 ? "" : "s"} ${action}${skipped}`, {
        description: "See the Audit tab in Logs for the full trail.",
      });
      setSelectedKeyIds(new Set());
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk update failed"),
  });

  // ---- Per-key + bulk compression-mode toggles ---------------------------
  const setKeyCompression = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: string }) =>
      call("set_key_compression", { body: { id, mode } }),
    onSuccess: () => {
      toast.success("Compression mode updated");
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });
  const bulkSetCompression = useMutation({
    mutationFn: ({ ids, mode }: { ids: string[]; mode: string }) =>
      call<{ updated: number; unchanged: number }>("bulk_set_key_compression", { body: { ids, mode } }),
    onSuccess: (r, vars) => {
      const skipped = r?.unchanged ? ` · ${r.unchanged} already on ${vars.mode}` : "";
      toast.success(`${r?.updated ?? 0} key${(r?.updated ?? 0) === 1 ? "" : "s"} → ${vars.mode}${skipped}`);
      setSelectedKeyIds(new Set());
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk update failed"),
  });

  // -------- Live API key test ---------------------------------------------
  // Sends a tiny real chat request through the upstream the key is bound to
  // and shows the result in a dialog: ok/fail, latency, reply, tokens, error.
  const [testingKey, setTestingKey] = useState<{ id: string; name: string } | null>(null);
  const [testKeyResult, setTestKeyResult] = useState<any | null>(null);
  // Number of concurrent requests to fire at the upstream when running a test.
  // 1 = single-shot health check; >1 = parallel test that proves the key handles
  // multiple model calls in flight simultaneously.
  const [testParallel, setTestParallel] = useState<number>(1);
  const testKey = useMutation({
    mutationFn: ({ id, parallel }: { id: string; parallel: number }) =>
      call<any>("test_api_key", { body: { api_key_id: id, parallel } }),
    onMutate: () => setTestKeyResult(null),
    onSuccess: (r) => {
      setTestKeyResult(r);
      if (r?.parallel) {
        if (r.ok) toast.success(`${r.succeeded}/${r.attempts} parallel calls OK · ${r.wall_ms}ms wall`);
        else toast.error(`${r.failed}/${r.attempts} parallel calls failed`);
      } else if (r?.ok) {
        toast.success(`Key works · ${r.latency_ms}ms`);
      } else {
        toast.error(r?.error || "Test failed");
      }
    },
    onError: (e: any) => {
      setTestKeyResult({ ok: false, error: e?.message || "Request failed" });
      toast.error(e?.message || "Test failed");
    },
  });

  const reset = () => {
    setOpen(false); setNewKey(null); setNewKeyId(null); setName("");
    setProviderId("lovable"); setModel(""); setProviderKey("");
    setCustom(emptyCustom); setTestResult(null);
    setPrefilledEndpointId(null);
  };
  const copy = (val: string) => { navigator.clipboard.writeText(val); toast.success("Copied"); };

  // Validation: enable Create button
  const requiresKey = isCustom
    ? custom.auth_scheme !== "none"
    : !selected?.managed;
  const canCreate = !!name && (
    isCustom
      ? !!custom.base_url && (!requiresKey || !!providerKey)
      : (!requiresKey || !!providerKey)
  );

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-[1320px] mx-auto">
      <div className="flex items-start justify-between gap-4 pb-1">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold tracking-tight">API Keys</h1>
          <p className="text-body text-muted-foreground mt-1 max-w-2xl">
            Issue keys for each environment. Test, rotate, and revoke without touching provider credentials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/dashboard/connect"><Sparkles className="h-4 w-4 mr-2" /> Connect a provider</a>
          </Button>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            {!newKey ? (
              <>
                <DialogHeader><DialogTitle>Create a new API key</DialogTitle></DialogHeader>
                {prefilledEndpointId && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-start gap-2">
                    <Plug className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <div className="text-muted-foreground">
                      Replacement key — will be bound to the same endpoint as the
                      key you're rotating.
                    </div>
                  </div>
                )}
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="inline-flex items-center gap-1.5">
                      Provider
                      <HelpHint>Pick a managed provider for the fastest setup, or <strong>Custom</strong> to point at any OpenAI-compatible / Anthropic-style endpoint (Perplexity, your Ollama, etc.).</HelpHint>
                    </Label>
                    <Select value={providerId} onValueChange={onProviderChange}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isCustom && customSchema && (
                    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Plug className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Custom endpoint</p>
                      </div>

                      <div>
                        <Label>Template (optional)</Label>
                        <Select value={custom.template} onValueChange={applyTemplate}>
                          <SelectTrigger className="mt-1.5">
                            <SelectValue placeholder="Pick a template to prefill" />
                          </SelectTrigger>
                          <SelectContent>
                            {customSchema.templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Kind</Label>
                        <Select
                          value={custom.kind}
                          onValueChange={(v) => setCustom({ ...custom, kind: v })}
                        >
                          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {customSchema.kinds.map((k) => (
                              <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Base URL</Label>
                        <Input
                          value={custom.base_url}
                          onChange={(e) => setCustom({ ...custom, base_url: e.target.value })}
                          placeholder="https://my-host/v1"
                          className="mt-1.5 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          We'll auto-append <code>/chat/completions</code> (or <code>/messages</code>) if missing.
                        </p>
                      </div>

                      <div>
                        <Label>Models URL (optional)</Label>
                        <Input
                          value={custom.models_url}
                          onChange={(e) => setCustom({ ...custom, models_url: e.target.value })}
                          placeholder="Leave blank to derive from base URL"
                          className="mt-1.5 font-mono text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Auth scheme</Label>
                          <Select
                            value={custom.auth_scheme}
                            onValueChange={(v) => setCustom({ ...custom, auth_scheme: v })}
                          >
                            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {customSchema.auth_schemes.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {(custom.auth_scheme === "header" || custom.auth_scheme === "query") && (
                          <div>
                            <Label>{custom.auth_scheme === "query" ? "Query param name" : "Header name"}</Label>
                            <Input
                              value={custom.auth_header}
                              onChange={(e) => setCustom({ ...custom, auth_header: e.target.value })}
                              placeholder={custom.auth_scheme === "query" ? "key" : "api-key"}
                              className="mt-1.5 font-mono text-sm"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <Label>Model suggestions (comma-separated, optional)</Label>
                        <Textarea
                          value={custom.model_suggestions}
                          onChange={(e) => setCustom({ ...custom, model_suggestions: e.target.value })}
                          placeholder="llama3.1, qwen2.5, gpt-oss:20b"
                          className="mt-1.5 font-mono text-xs"
                          rows={2}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Used as fallback if <code>/models</code> can't be reached.
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <Label>Extra headers</Label>
                          <Button
                            type="button" size="sm" variant="ghost"
                            onClick={() => setCustom({
                              ...custom,
                              extra_headers: [...custom.extra_headers, { key: "", value: "" }],
                            })}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add
                          </Button>
                        </div>
                        {custom.extra_headers.length === 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            e.g. <code>api-version: 2024-10-21</code> for Azure.
                          </p>
                        )}
                        <div className="space-y-2 mt-1.5">
                          {custom.extra_headers.map((h, i) => (
                            <div key={i} className="flex gap-2">
                              <Input
                                value={h.key} placeholder="header-name"
                                onChange={(e) => {
                                  const next = [...custom.extra_headers];
                                  next[i] = { ...next[i], key: e.target.value };
                                  setCustom({ ...custom, extra_headers: next });
                                }}
                                className="font-mono text-xs"
                              />
                              <Input
                                value={h.value} placeholder="value"
                                onChange={(e) => {
                                  const next = [...custom.extra_headers];
                                  next[i] = { ...next[i], value: e.target.value };
                                  setCustom({ ...custom, extra_headers: next });
                                }}
                                className="font-mono text-xs"
                              />
                              <Button
                                type="button" size="icon" variant="ghost"
                                onClick={() => setCustom({
                                  ...custom,
                                  extra_headers: custom.extra_headers.filter((_, j) => j !== i),
                                })}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="model">Default model</Label>
                    <Input id="model" value={model || selected?.default_model || ""} onChange={(e) => setModel(e.target.value)} className="mt-1.5 font-mono text-sm" placeholder={isCustom ? "e.g. llama3.1" : ""} />
                    {selected && selected.model_suggestions.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Suggestions: {selected.model_suggestions.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                  {requiresKey && (
                    <div>
                      <Label htmlFor="ok">{isCustom ? "Provider API key" : `${selected?.label} API key`}</Label>
                      <Input id="ok" type="password" value={providerKey} onChange={(e) => setProviderKey(e.target.value)} placeholder={selected?.key_placeholder || "your-api-key"} className="mt-1.5 font-mono text-sm" />
                      {!isCustom && selected && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Encrypted at rest. <a href={selected.get_key_url} target="_blank" rel="noreferrer" className="underline">Get a key →</a>
                        </p>
                      )}
                    </div>
                  )}

                  {isCustom && (
                    <div className="space-y-2">
                      <Button
                        type="button" variant="outline" size="sm"
                        onClick={testCustom}
                        disabled={testing || !custom.base_url}
                      >
                        {testing ? "Testing…" : "Test connection"}
                      </Button>
                      {testResult && (
                        <div className={`text-xs flex items-start gap-2 p-2 rounded-md ${testResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                          {testResult.ok ? <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                          <span className="break-all">{testResult.msg}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                  <Button onClick={() => create.mutate()} disabled={create.isPending || !canCreate}>
                    {create.isPending ? "Creating…" : "Create key"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" /> Key created</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">Copy this key now. You won't be able to see it again.</p>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
                    <code className="flex-1 truncate">{newKey}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(newKey)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  {newKeyId && (
                    <Button
                      variant="default"
                      onClick={() => {
                        const id = newKeyId;
                        reset();
                        navigate(`/dashboard/playground?key=${id}`);
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Try in Playground
                    </Button>
                  )}
                  <Button variant="outline" onClick={reset}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <HelpPanel
        storageKey="keys"
        title="How AnveGuard keys work"
        steps={[
          {
            title: "One key per environment or app",
            body: <>Each <code className="font-mono">ag_live_…</code> key proxies requests to a single upstream provider. Issue separate keys for staging vs prod so you can revoke one without breaking the other.</>,
          },
          {
            title: "Provider credentials stay server-side",
            body: "Your real Perplexity / OpenAI / Anthropic key is encrypted server-side. Clients only ever see the AnveGuard key, so a leaked key affects one app — not your provider account.",
          },
          {
            title: "Rotate without downtime",
            body: <>Use <strong>Create replacement key</strong> to mint a new key bound to the same endpoint, swap it in your app, then revoke the old one.</>,
          },
          {
            title: "Admin keys can override system prompts",
            body: <>Only <strong>admin</strong> keys are allowed to send a <code className="font-mono">system_prompt</code> alongside the workspace guardrail. Leave it off for regular app keys.</>,
          },
        ]}
        examples={[
          {
            label: "curl with an AnveGuard key",
            code: `curl https://${typeof window !== "undefined" ? window.location.host : "your-app"}/proxy/v1/chat/completions \\
  -H 'Authorization: Bearer ag_live_…' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "sonar-pro",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
          },
        ]}
      />

      {/* Bulk action bar — only rendered when there's an active selection so
          the page stays calm in the common case. Both buttons hit the
          `bulk_set_key_admin` endpoint, which writes one audit_logs row per
          changed key. */}
      {selectedKeyIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-2.5">
          <div className="text-meta">
            <span className="font-medium tabular-nums">{selectedKeyIds.size}</span> key{selectedKeyIds.size === 1 ? "" : "s"} selected
            <span className="text-muted-foreground"> · changes are logged to the audit trail</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              disabled={bulkSetAdmin.isPending}
              onClick={() => bulkSetAdmin.mutate({ ids: Array.from(selectedKeyIds), is_admin: true })}
              title="Allow these keys to send a custom system_prompt"
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
              Grant system_prompt
            </Button>
            <Button
              size="sm" variant="outline"
              disabled={bulkSetAdmin.isPending}
              onClick={() => bulkSetAdmin.mutate({ ids: Array.from(selectedKeyIds), is_admin: false })}
              title="Revoke per-request system_prompt permission from these keys"
            >
              <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
              Revoke system_prompt
            </Button>
            <Select
              onValueChange={(mode) =>
                bulkSetCompression.mutate({ ids: Array.from(selectedKeyIds), mode })
              }
            >
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Set compression…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Inherit workspace</SelectItem>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setSelectedKeyIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* High-density key table */}
      <Card className="surface-1 border-border overflow-hidden">
        {/* Horizontal scroll on narrow viewports keeps the dense table readable
            without collapsing columns. min-w on the inner grid preserves the
            intended column proportions. */}
        <div className="overflow-x-auto">
        <div className="min-w-[680px]">
        <div className="grid grid-cols-[32px_minmax(0,1.4fr)_minmax(0,1.2fr)_120px_92px_auto] gap-3 px-4 h-9 items-center border-b border-border bg-surface-2/60 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.1em]">
          <div className="flex items-center">
            <Checkbox
              aria-label="Select all keys"
              checked={
                (data?.keys?.length ?? 0) > 0 &&
                data!.keys!.every((k: any) => selectedKeyIds.has(k.id))
              }
              onCheckedChange={(v) => {
                if (v) setSelectedKeyIds(new Set((data?.keys ?? []).map((k: any) => k.id)));
                else setSelectedKeyIds(new Set());
              }}
            />
          </div>
          <div>Key</div>
          <div>Provider · Model</div>
          <div>Last used</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>
        {isLoading ? (
          <SkeletonRows
            rows={5}
            cols="grid-cols-[32px_minmax(0,1.4fr)_minmax(0,1.2fr)_120px_92px_auto]"
            rowClassName="h-12"
          />
        ) : (data?.keys?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" />}
            title="No keys yet"
            description="Issue your first AnveGuard key to start proxying requests."
            action={
              <Button onClick={() => setOpen(true)} size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New key
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.keys.map((k: any) => (
              <li
                key={k.id}
                data-key-row={k.id}
                className={`grid grid-cols-[32px_minmax(0,1.4fr)_minmax(0,1.2fr)_120px_92px_auto] gap-3 px-4 h-12 items-center hover:bg-surface-2/60 transition-colors ${
                  focusKeyId === k.id ? "ring-2 ring-primary/60 bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center">
                  <Checkbox
                    aria-label={`Select ${k.name}`}
                    checked={selectedKeyIds.has(k.id)}
                    onCheckedChange={() => toggleSelected(k.id)}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-body font-medium truncate flex items-center gap-2">
                    {k.name}
                    <span className="text-meta text-muted-foreground font-mono">{k.key_prefix}…</span>
                  </div>
                  <div className="text-meta text-muted-foreground font-mono truncate flex items-center gap-1">
                    <span className="truncate">{PROXY_URL}</span>
                    <button
                      type="button"
                      title="Copy base URL"
                      onClick={() => { navigator.clipboard.writeText(PROXY_URL); toast.success("Base URL copied"); }}
                      className="shrink-0 hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="min-w-0 text-meta text-muted-foreground font-mono truncate">
                  {k.provider} · {k.model_default}
                </div>
                <div className="text-meta text-muted-foreground tabular-nums">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge status={k.is_active ? "ok" : "neutral"}>{k.is_active ? "active" : "revoked"}</Badge>
                  {k.is_admin && <Badge status="warn" title="Allowed to send custom system_prompt">admin</Badge>}
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {k.is_active && (
                    <>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setIntegrateFor({ id: k.id, name: k.name, key_prefix: k.key_prefix })}
                        title="Show integration snippets for this key"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setAliasesFor({ id: k.id, name: k.name })}
                        title="Manage model aliases for this key"
                      >
                        <Tags className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        disabled={testKey.isPending && testingKey?.id === k.id}
                        onClick={() => { setTestingKey({ id: k.id, name: k.name }); testKey.mutate({ id: k.id, parallel: testParallel }); }}
                        title="Send a tiny test request through this key's upstream"
                      >
                        {testKey.isPending && testingKey?.id === k.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Beaker className="h-3.5 w-3.5" />}
                      </Button>
                      <Select
                        value={k.compression_mode ?? "inherit"}
                        onValueChange={(mode) => setKeyCompression.mutate({ id: k.id, mode })}
                      >
                        <SelectTrigger
                          className="h-7 w-[110px] text-[11px] px-2"
                          title="Token compression for this key (overrides workspace default)"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">Inherit</SelectItem>
                          <SelectItem value="off">Off</SelectItem>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="balanced">Balanced</SelectItem>
                          <SelectItem value="aggressive">Aggressive</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setKeyAdmin.mutate({ id: k.id, is_admin: !k.is_admin })}
                        title={k.is_admin
                          ? "Revoke admin permission (key can no longer send custom system_prompt)"
                          : "Grant admin permission (allow this key to send a custom system_prompt)"}
                      >
                        {k.is_admin
                          ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                          : <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => revoke.mutate(k.id)} title="Revoke key">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        </div>
        </div>
      </Card>

      {/* Snippet card — one base URL, three SDK shapes */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Quick start</div>
          <div className="text-h2 font-medium mt-0.5">Use it in your app</div>
          <p className="text-meta text-muted-foreground mt-1.5">
            Point any OpenAI, Anthropic, or Google Gemini SDK at the URLs below and pass your{" "}
            <span className="font-mono">ag_live_…</span> key. AnveGuard runs the same policies, throttling and
            logging on every shape — no client code changes needed.
          </p>
        </div>
        <CardContent className="p-5 space-y-5">
          <EndpointSnippet
            label="OpenAI Chat Completions"
            url={`${PROXY_URL}/v1/chat/completions`}
            code={`from openai import OpenAI

client = OpenAI(
    base_url="${PROXY_URL}",
    api_key="ag_live_••••••••",
)
client.chat.completions.create(
    model="gpt-5",
    messages=[{"role": "user", "content": "Hello"}],
)`}
          />
          <EndpointSnippet
            label="Anthropic Messages"
            url={`${PROXY_URL}/v1/messages`}
            code={`import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "${PROXY_URL}",
  apiKey: "ag_live_••••••••", // sent as x-api-key
});
await client.messages.create({
  model: "claude-3-5-sonnet-latest",
  max_tokens: 256,
  messages: [{ role: "user", content: "Hello" }],
});`}
          />
          <EndpointSnippet
            label="Google Gemini generateContent"
            url={`${PROXY_URL}/v1beta/models/{model}:generateContent`}
            code={`curl "${PROXY_URL}/v1beta/models/gemini-2.5-flash:generateContent?key=ag_live_••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}'`}
          />
        </CardContent>
      </Card>

      {/* Test result dialog — opened by clicking "Test" on any key row. */}
      <Dialog
        open={!!testingKey}
        onOpenChange={(o) => { if (!o) { setTestingKey(null); setTestKeyResult(null); } }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {testKey.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : testKeyResult?.ok
                  ? <Check className="h-4 w-4 text-primary" />
                  : <X className="h-4 w-4 text-destructive" />}
              Test · {testingKey?.name}
            </DialogTitle>
          </DialogHeader>

          {testKey.isPending ? (
            <div className="py-6 text-sm text-muted-foreground">
              {testParallel > 1
                ? `Firing ${testParallel} parallel requests at this key's upstream…`
                : "Sending a tiny request through this key's upstream…"}
            </div>
          ) : testKeyResult ? (
            <div className="space-y-3 text-sm">
              {/* Headline status banner — parallel mode shows batch summary */}
              <div className={`rounded-md border px-3 py-2 ${
                testKeyResult.ok
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-destructive/40 bg-destructive/5 text-destructive"
              }`}>
                {testKeyResult.parallel ? (
                  testKeyResult.ok
                    ? <><strong>{testKeyResult.succeeded}/{testKeyResult.attempts}</strong> parallel calls succeeded in <strong>{testKeyResult.wall_ms}ms</strong> wall time.</>
                    : <><strong>{testKeyResult.failed}/{testKeyResult.attempts}</strong> parallel calls failed.</>
                ) : testKeyResult.ok ? (
                  <>Upstream responded <strong>{testKeyResult.status}</strong> in <strong>{testKeyResult.latency_ms}ms</strong>.</>
                ) : (
                  <>{testKeyResult.error || "Test failed."}{typeof testKeyResult.status === "number" && <> · status {testKeyResult.status}</>}{typeof testKeyResult.latency_ms === "number" && <> · {testKeyResult.latency_ms}ms</>}</>
                )}
              </div>

              {/* Parallel batch stats — speedup > 1 proves real concurrency */}
              {testKeyResult.parallel && (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs grid grid-cols-2 sm:grid-cols-4 gap-y-1 gap-x-4">
                  <span><span className="text-muted-foreground">Wall:</span> {testKeyResult.wall_ms}ms</span>
                  <span><span className="text-muted-foreground">Avg:</span> {testKeyResult.avg_latency_ms}ms</span>
                  <span><span className="text-muted-foreground">p95:</span> {testKeyResult.p95_latency_ms}ms</span>
                  <span><span className="text-muted-foreground">Min/Max:</span> {testKeyResult.min_latency_ms}/{testKeyResult.max_latency_ms}ms</span>
                  <span className="col-span-2 sm:col-span-4">
                    <span className="text-muted-foreground">Speedup:</span> <strong>{testKeyResult.speedup}×</strong>
                    <span className="text-muted-foreground"> (sum of latencies ÷ wall time — &gt;1 means real concurrency)</span>
                  </span>
                </div>
              )}

              {testKeyResult.target && (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs space-y-1">
                  <div><span className="text-muted-foreground">URL:</span> <code className="break-all">{testKeyResult.target.url}</code></div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span><span className="text-muted-foreground">Model:</span> <code>{testKeyResult.target.model}</code></span>
                    <span><span className="text-muted-foreground">Format:</span> <code>{testKeyResult.target.format}</code></span>
                    {!testKeyResult.parallel && testKeyResult.tokens_in != null && (
                      <span><span className="text-muted-foreground">Tokens:</span> {testKeyResult.tokens_in}/{testKeyResult.tokens_out}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Per-attempt rows for parallel runs */}
              {testKeyResult.parallel && Array.isArray(testKeyResult.results) && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Per-call results</div>
                  <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                    {testKeyResult.results.map((r: any) => (
                      <div key={r.index} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        {r.ok
                          ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          : <X className="h-3.5 w-3.5 text-destructive shrink-0" />}
                        <span className="font-mono text-muted-foreground w-6">#{r.index + 1}</span>
                        <span className="w-16">{r.latency_ms}ms</span>
                        {typeof r.status === "number" && <span className="w-12">{r.status}</span>}
                        <span className="flex-1 truncate text-muted-foreground">
                          {r.ok ? (r.reply || "(empty reply)") : (r.error || "failed")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Single-shot reply preview */}
              {!testKeyResult.parallel && testKeyResult.ok && testKeyResult.reply && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Reply preview</div>
                  <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{testKeyResult.reply}</pre>
                </div>
              )}

              {!testKeyResult.ok && testKeyResult.detail !== undefined && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Upstream error detail</div>
                  <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{typeof testKeyResult.detail === "string" ? testKeyResult.detail : JSON.stringify(testKeyResult.detail, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            {/* Parallel selector — choose how many concurrent requests to fire */}
            <div className="flex items-center gap-2 text-xs">
              <Label className="text-xs text-muted-foreground">Parallel</Label>
              <Select
                value={String(testParallel)}
                onValueChange={(v) => setTestParallel(Number(v))}
                disabled={testKey.isPending}
              >
                <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}{n === 1 ? " (single)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {testingKey && (
                <Button
                  variant="outline"
                  disabled={testKey.isPending}
                  onClick={() => testKey.mutate({ id: testingKey.id, parallel: testParallel })}
                >
                  {testKey.isPending ? "Testing…" : "Run again"}
                </Button>
              )}
              <Button onClick={() => { setTestingKey(null); setTestKeyResult(null); }}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AliasesSheet
        open={!!aliasesFor}
        onOpenChange={(v) => !v && setAliasesFor(null)}
        apiKeyId={aliasesFor?.id ?? null}
        apiKeyName={aliasesFor?.name ?? ""}
      />

      <IntegrateDialog
        open={!!integrateFor}
        onClose={() => setIntegrateFor(null)}
        keyName={integrateFor?.name ?? ""}
        keyPrefix={integrateFor?.key_prefix ?? ""}
      />
    </div>
  );
};

// ---- Per-key Integrate dialog: full base URL + curl/Node/Python snippets
//      for both OpenAI Chat Completions and Anthropic Messages shapes.
const SAMPLE_KEY_PLACEHOLDER = "ag_live_•••••••••••••";

function snippetsFor(baseUrl: string, apiKey: string) {
  return {
    openai: {
      curl: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
      node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

const res = await client.chat.completions.create({
  model: "gpt-5",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(res.choices[0].message.content);`,
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
)

res = client.chat.completions.create(
    model="gpt-5",
    messages=[{"role": "user", "content": "Hello"}],
)
print(res.choices[0].message.content)`,
    },
    anthropic: {
      curl: `curl ${baseUrl}/v1/messages \\
  -H "x-api-key: ${apiKey}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet-latest",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
      node: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}", // sent as x-api-key
});

const msg = await client.messages.create({
  model: "claude-3-5-sonnet-latest",
  max_tokens: 256,
  messages: [{ role: "user", content: "Hello" }],
});
console.log(msg.content);`,
      python: `import anthropic

client = anthropic.Anthropic(
    base_url="${baseUrl}",
    api_key="${apiKey}",
)

msg = client.messages.create(
    model="claude-3-5-sonnet-latest",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello"}],
)
print(msg.content)`,
    },
    // GET /v1/models — OpenAI-spec listing served by the proxy. Works for any
    // upstream provider; the proxy normalizes the response shape.
    models: {
      curl: `curl ${baseUrl}/v1/models \\
  -H "Authorization: Bearer ${apiKey}"`,
      node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

const list = await client.models.list();
for (const m of list.data) console.log(m.id);`,
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
)

for m in client.models.list().data:
    print(m.id)`,
    },
  };
}

const IntegrateDialog = ({
  open, onClose, keyName, keyPrefix,
}: { open: boolean; onClose: () => void; keyName: string; keyPrefix: string }) => {
  const [shape, setShape] = useState<"openai" | "anthropic" | "models">("openai");
  const [lang, setLang] = useState<"curl" | "node" | "python">("curl");
  const apiKey = keyPrefix ? `${keyPrefix}…` : SAMPLE_KEY_PLACEHOLDER;
  const snippets = snippetsFor(PROXY_URL, apiKey);
  const code = (snippets as any)[shape][lang] as string;
  const endpointPath =
    shape === "openai" ? "/v1/chat/completions" :
    shape === "anthropic" ? "/v1/messages" :
    "/v1/models";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4" /> Integrate · {keyName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border surface-2 p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Base URL</div>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono break-all flex-1">{PROXY_URL}</code>
              <Button
                size="sm" variant="outline"
                onClick={() => { navigator.clipboard.writeText(PROXY_URL); toast.success("Base URL copied"); }}
              >
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
            <div className="text-meta text-muted-foreground">
              Endpoint: <span className="font-mono">{PROXY_URL}{endpointPath}</span>
            </div>
            <div className="text-meta text-muted-foreground">
              Replace <span className="font-mono">{apiKey}</span> with the full <span className="font-mono">ag_live_…</span> key value (shown only once when created).
            </div>
          </div>

          <Tabs value={shape} onValueChange={(v) => setShape(v as any)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="openai">Chat Completions</TabsTrigger>
              <TabsTrigger value="anthropic">Anthropic Messages</TabsTrigger>
              <TabsTrigger value="models">List models</TabsTrigger>
            </TabsList>

            <TabsContent value={shape} className="mt-3 space-y-2">
              <Tabs value={lang} onValueChange={(v) => setLang(v as any)}>
                <div className="flex items-center justify-between gap-2">
                  <TabsList>
                    <TabsTrigger value="curl">curl</TabsTrigger>
                    <TabsTrigger value="node">Node.js</TabsTrigger>
                    <TabsTrigger value="python">Python</TabsTrigger>
                  </TabsList>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { navigator.clipboard.writeText(code); toast.success("Snippet copied"); }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <pre className="mt-2 rounded-md border border-border bg-surface-2 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-[360px]">
{code}
                </pre>
                {shape === "models" && (
                  <div className="text-meta text-muted-foreground">
                    Returns <span className="font-mono">{`{ object: "list", data: [{ id, object: "model", owned_by, ... }] }`}</span> — normalized from the upstream provider's listing.
                  </div>
                )}
              </Tabs>
            </TabsContent>
          </Tabs>

          <TestKeyPanel keyPrefix={keyPrefix} />
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Live "Test my key" panel inside the Integrate dialog. Sends a small
 * /v1/chat/completions request through the proxy using the user-supplied
 * full API key (we only have the masked prefix from the list view) and
 * renders the outcome:
 *   - allowed:     assistant text + model used
 *   - blocked:     policy reason + matched layers (from `anveguard` envelope)
 *   - error:       HTTP status + standardized error message/code
 *
 * The key is held only in component state; it never leaves the browser
 * except as the Authorization header on the test request itself.
 */
type TestOutcome =
  | { kind: "allowed"; content: string; model: string; tokens?: { in?: number; out?: number } }
  | { kind: "blocked"; reason: string; layers: Array<{ layer: string; rule?: string; reason?: string }> }
  | { kind: "error"; status: number; message: string; code?: string | null };

const TestKeyPanel = ({ keyPrefix }: { keyPrefix: string }) => {
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("Say hello in one short sentence.");
  const [model, setModel] = useState("gpt-5-mini");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);

  const runTest = async () => {
    if (!apiKey.startsWith("ag_live_")) {
      toast.error("Paste the full ag_live_… key (only shown once when created).");
      return;
    }
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch(`${PROXY_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 64,
        }),
      });

      let data: any = null;
      try { data = await res.json(); } catch { /* non-JSON */ }

      // Standardized OpenAI-style error envelope from our proxy.
      if (!res.ok) {
        setOutcome({
          kind: "error",
          status: res.status,
          message: data?.error?.message || `HTTP ${res.status}`,
          code: data?.error?.code ?? null,
        });
        return;
      }

      // Policy block: 200 OK with `anveguard.blocked` flag and content_filter.
      const finish = data?.choices?.[0]?.finish_reason;
      if (data?.anveguard?.blocked || finish === "content_filter") {
        setOutcome({
          kind: "blocked",
          reason: data?.anveguard?.reason || "Blocked by policy",
          layers: Array.isArray(data?.anveguard?.layers) ? data.anveguard.layers : [],
        });
        return;
      }

      const content = data?.choices?.[0]?.message?.content ?? "";
      setOutcome({
        kind: "allowed",
        content: typeof content === "string" ? content : JSON.stringify(content),
        model: data?.model ?? model,
        tokens: {
          in: data?.usage?.prompt_tokens,
          out: data?.usage?.completion_tokens,
        },
      });
    } catch (e) {
      setOutcome({
        kind: "error",
        status: 0,
        message: e instanceof Error ? e.message : String(e),
        code: "network_error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border surface-2 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Test my key</div>
          <div className="text-meta text-muted-foreground">
            Sends a small request through the proxy and shows the result or any policy block.
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="test-key" className="text-xs">Full API key</Label>
        <Input
          id="test-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={keyPrefix ? `${keyPrefix}…` : "ag_live_…"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="font-mono text-xs"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="test-prompt" className="text-xs">Prompt</Label>
          <Textarea
            id="test-prompt"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="text-xs"
          />
        </div>
        <div className="grid gap-2 sm:w-44">
          <Label htmlFor="test-model" className="text-xs">Model</Label>
          <Input
            id="test-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button size="sm" onClick={runTest} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
          {busy ? "Testing…" : "Run test"}
        </Button>
      </div>

      {outcome && <TestOutcomeView outcome={outcome} />}
    </div>
  );
};

const TestOutcomeView = ({ outcome }: { outcome: TestOutcome }) => {
  if (outcome.kind === "allowed") {
    return (
      <div className="rounded-md border border-border bg-background p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span className="font-medium">Allowed</span>
          <Badge variant="outline" className="font-mono text-[10px]">{outcome.model}</Badge>
          {outcome.tokens && (outcome.tokens.in != null || outcome.tokens.out != null) && (
            <span className="text-meta text-muted-foreground">
              {outcome.tokens.in ?? 0} in · {outcome.tokens.out ?? 0} out
            </span>
          )}
        </div>
        <pre className="text-xs whitespace-pre-wrap break-words font-mono">{outcome.content || "(empty response)"}</pre>
      </div>
    );
  }

  if (outcome.kind === "blocked") {
    return (
      <div className="rounded-md border border-border bg-background p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <span className="font-medium">Blocked by policy</span>
        </div>
        <div className="text-xs">{outcome.reason}</div>
        {outcome.layers.length > 0 && (
          <ul className="text-meta text-muted-foreground space-y-0.5">
            {outcome.layers.map((l, i) => (
              <li key={i} className="font-mono">
                · {l.layer}{l.rule ? ` / ${l.rule}` : ""}{l.reason ? ` — ${l.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <span className="font-medium">Error</span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {outcome.status || "network"}{outcome.code ? ` · ${outcome.code}` : ""}
        </Badge>
      </div>
      <div className="text-xs break-words">{outcome.message}</div>
    </div>
  );
};

/**
 * Per-shape endpoint card: shows the URL the SDK should target plus a
 * minimal copy/paste snippet. Kept inline so it can use the local
 * `PROXY_URL` constant without prop-drilling.
 */
const EndpointSnippet = ({
  label, url, code,
}: { label: string; url: string; code: string }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-meta uppercase tracking-wider text-muted-foreground">{label}</div>
      <code className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-2 border border-border text-foreground break-all">
        {url}
      </code>
    </div>
    <pre className="rounded-md border border-border bg-surface-2 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
{code}
    </pre>
  </div>
);

export default Keys;
