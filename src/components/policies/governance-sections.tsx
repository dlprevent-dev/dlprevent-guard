import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench, Globe, Sparkles, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDashboardApi } from "@/lib/api";

// Triage-parity config sections (Wave 4): tool governance, egress allowlist,
// model-assisted jailbreak classifier. Each mirrors the compression-section
// draft -> dirty -> save_policy_settings pattern. Lists are entered one item
// per line (or comma-separated) and normalized to lowercase.

const linesToList = (s: string): string[] =>
  s.split(/[\n,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const listToLines = (a: unknown): string => (Array.isArray(a) ? a.join("\n") : "");

// ---------------------------------------------------------------------------
// Tool-call governance
// ---------------------------------------------------------------------------

type ToolDraft = {
  enable_tool_governance: boolean;
  tool_governance_action: "block" | "flag" | "sanitize";
  tool_allowlist: string;
  tool_denylist: string;
  tool_governance_scan_response: boolean;
};

export function ToolGovernanceSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const snapshot: ToolDraft = useMemo(() => {
    const s = settingsQ.data?.settings ?? {};
    return {
      enable_tool_governance: !!s.enable_tool_governance,
      tool_governance_action: (["block", "flag", "sanitize"].includes(s.tool_governance_action)
        ? s.tool_governance_action : "block") as ToolDraft["tool_governance_action"],
      tool_allowlist: listToLines(s.tool_allowlist),
      tool_denylist: listToLines(s.tool_denylist),
      tool_governance_scan_response: s.tool_governance_scan_response !== false,
    };
  }, [settingsQ.data]);

  const [draft, setDraft] = useState<ToolDraft>(snapshot);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot);

  const save = useMutation({
    mutationFn: () => call("save_policy_settings", {
      body: {
        enable_tool_governance: draft.enable_tool_governance,
        tool_governance_action: draft.tool_governance_action,
        tool_allowlist: linesToList(draft.tool_allowlist),
        tool_denylist: linesToList(draft.tool_denylist),
        tool_governance_scan_response: draft.tool_governance_scan_response,
      },
    }),
    onSuccess: () => { toast.success("Tool governance saved"); qc.invalidateQueries({ queryKey: ["policy_settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card className="surface-1 border-border">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 text-primary p-2"><Wrench className="h-4 w-4" /></div>
            <div>
              <div className="text-h2 font-medium">Tool governance</div>
              <p className="text-meta text-muted-foreground mt-1 max-w-prose">
                Allow or deny which tools the model may call. Checks tools declared in the
                request and tools the model invokes in its response. An empty allow list = deny-list
                only mode; a non-empty allow list is strict.
              </p>
            </div>
          </div>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
          <Label className="text-body">Enable tool governance</Label>
          <Switch checked={draft.enable_tool_governance}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, enable_tool_governance: v }))} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-meta text-muted-foreground">Allow list (one tool name per line)</Label>
            <Textarea className="mt-1.5 font-mono text-xs min-h-[88px]" placeholder={"get_weather\nsearch_docs"}
              value={draft.tool_allowlist}
              onChange={(e) => setDraft((d) => ({ ...d, tool_allowlist: e.target.value }))} />
          </div>
          <div>
            <Label className="text-meta text-muted-foreground">Deny list (always blocked)</Label>
            <Textarea className="mt-1.5 font-mono text-xs min-h-[88px]" placeholder={"delete_database\ntransfer_funds"}
              value={draft.tool_denylist}
              onChange={(e) => setDraft((d) => ({ ...d, tool_denylist: e.target.value }))} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-meta text-muted-foreground">Action on violation</Label>
            <Select value={draft.tool_governance_action}
              onValueChange={(v) => setDraft((d) => ({ ...d, tool_governance_action: v as ToolDraft["tool_governance_action"] }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="block">Block</SelectItem>
                <SelectItem value="flag">Flag (log only)</SelectItem>
                <SelectItem value="sanitize">Sanitize (treated as block)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5 self-end">
            <div>
              <Label className="text-body">Scan response tool calls</Label>
              <p className="text-meta text-muted-foreground">Best-effort on streaming responses.</p>
            </div>
            <Switch checked={draft.tool_governance_scan_response}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, tool_governance_scan_response: v }))} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Egress / outbound-domain allowlist
// ---------------------------------------------------------------------------

type EgressDraft = {
  enable_egress_filter: boolean;
  egress_action: "block" | "flag" | "sanitize";
  egress_domain_allowlist: string;
  egress_domain_denylist: string;
  egress_block_private_ips: boolean;
};

export function EgressSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const snapshot: EgressDraft = useMemo(() => {
    const s = settingsQ.data?.settings ?? {};
    return {
      enable_egress_filter: !!s.enable_egress_filter,
      egress_action: (["block", "flag", "sanitize"].includes(s.egress_action)
        ? s.egress_action : "flag") as EgressDraft["egress_action"],
      egress_domain_allowlist: listToLines(s.egress_domain_allowlist),
      egress_domain_denylist: listToLines(s.egress_domain_denylist),
      egress_block_private_ips: s.egress_block_private_ips !== false,
    };
  }, [settingsQ.data]);

  const [draft, setDraft] = useState<EgressDraft>(snapshot);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot);

  const save = useMutation({
    mutationFn: () => call("save_policy_settings", {
      body: {
        enable_egress_filter: draft.enable_egress_filter,
        egress_action: draft.egress_action,
        egress_domain_allowlist: linesToList(draft.egress_domain_allowlist),
        egress_domain_denylist: linesToList(draft.egress_domain_denylist),
        egress_block_private_ips: draft.egress_block_private_ips,
      },
    }),
    onSuccess: () => { toast.success("Egress allowlist saved"); qc.invalidateQueries({ queryKey: ["policy_settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card className="surface-1 border-border">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 text-primary p-2"><Globe className="h-4 w-4" /></div>
            <div>
              <div className="text-h2 font-medium">Egress allowlist</div>
              <p className="text-meta text-muted-foreground mt-1 max-w-prose">
                Scan model output for URLs to disallowed domains (data-exfil channel). An apex
                domain matches its subdomains. Private / loopback / cloud-metadata IPs are always
                blocked (SSRF). Applies to the response only.
              </p>
            </div>
          </div>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
          <Label className="text-body">Enable egress filter</Label>
          <Switch checked={draft.enable_egress_filter}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, enable_egress_filter: v }))} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-meta text-muted-foreground">Allowed domains (one per line)</Label>
            <Textarea className="mt-1.5 font-mono text-xs min-h-[88px]" placeholder={"acme.com\napi.github.com"}
              value={draft.egress_domain_allowlist}
              onChange={(e) => setDraft((d) => ({ ...d, egress_domain_allowlist: e.target.value }))} />
            <p className="text-[11px] text-muted-foreground mt-1">Empty = allow all (deny-list only mode).</p>
          </div>
          <div>
            <Label className="text-meta text-muted-foreground">Denied domains</Label>
            <Textarea className="mt-1.5 font-mono text-xs min-h-[88px]" placeholder={"pastebin.com\nattacker.tld"}
              value={draft.egress_domain_denylist}
              onChange={(e) => setDraft((d) => ({ ...d, egress_domain_denylist: e.target.value }))} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-meta text-muted-foreground">Action on disallowed domain</Label>
            <Select value={draft.egress_action}
              onValueChange={(v) => setDraft((d) => ({ ...d, egress_action: v as EgressDraft["egress_action"] }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flag">Flag (log only)</SelectItem>
                <SelectItem value="block">Block</SelectItem>
                <SelectItem value="sanitize">Sanitize (treated as flag)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5 self-end">
            <div>
              <Label className="text-body">Block private / metadata IPs</Label>
              <p className="text-meta text-muted-foreground">127.x, 10.x, 169.254.169.254, localhost…</p>
            </div>
            <Switch checked={draft.egress_block_private_ips}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, egress_block_private_ips: v }))} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Model-assisted jailbreak classifier
// ---------------------------------------------------------------------------

type MlDraft = {
  enable_model_jailbreak_classifier: boolean;
  model_jailbreak_shadow_mode: boolean;
  model_jailbreak_action: "block" | "flag";
  model_jailbreak_threshold: number;
};

export function ModelClassifierSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const snapshot: MlDraft = useMemo(() => {
    const s = settingsQ.data?.settings ?? {};
    const t = Number(s.model_jailbreak_threshold);
    return {
      enable_model_jailbreak_classifier: !!s.enable_model_jailbreak_classifier,
      model_jailbreak_shadow_mode: s.model_jailbreak_shadow_mode !== false,
      model_jailbreak_action: (["block", "flag"].includes(s.model_jailbreak_action)
        ? s.model_jailbreak_action : "block") as MlDraft["model_jailbreak_action"],
      model_jailbreak_threshold: t >= 0.5 && t <= 0.99 ? t : 0.8,
    };
  }, [settingsQ.data]);

  const [draft, setDraft] = useState<MlDraft>(snapshot);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot);

  const save = useMutation({
    mutationFn: () => call("save_policy_settings", {
      body: {
        enable_model_jailbreak_classifier: draft.enable_model_jailbreak_classifier,
        model_jailbreak_shadow_mode: draft.model_jailbreak_shadow_mode,
        model_jailbreak_action: draft.model_jailbreak_action,
        model_jailbreak_threshold: draft.model_jailbreak_threshold,
      },
    }),
    onSuccess: () => { toast.success("Model classifier saved"); qc.invalidateQueries({ queryKey: ["policy_settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card className="surface-1 border-border">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 text-primary p-2"><Sparkles className="h-4 w-4" /></div>
            <div>
              <div className="text-h2 font-medium">Model-assisted classifier</div>
              <p className="text-meta text-muted-foreground mt-1 max-w-prose">
                An optional LLM jailbreak / prompt-injection detector that runs on input after the
                deterministic layers (skipped when something already blocked). Adds one Lovable AI
                call per request — leave shadow mode on to log without blocking while you tune it.
              </p>
            </div>
          </div>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
            <Label className="text-body">Enable classifier</Label>
            <Switch checked={draft.enable_model_jailbreak_classifier}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enable_model_jailbreak_classifier: v }))} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
            <div>
              <Label className="text-body">Shadow mode</Label>
              <p className="text-meta text-muted-foreground">Log only, never block.</p>
            </div>
            <Switch checked={draft.model_jailbreak_shadow_mode}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, model_jailbreak_shadow_mode: v }))} />
          </div>
          <div>
            <Label className="text-meta text-muted-foreground">Action (when not shadow)</Label>
            <Select value={draft.model_jailbreak_action}
              onValueChange={(v) => setDraft((d) => ({ ...d, model_jailbreak_action: v as MlDraft["model_jailbreak_action"] }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="block">Block</SelectItem>
                <SelectItem value="flag">Flag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-meta text-muted-foreground">Confidence threshold (0.5–0.99)</Label>
            <Input type="number" min={0.5} max={0.99} step={0.01} className="mt-1.5"
              value={draft.model_jailbreak_threshold}
              onChange={(e) => setDraft((d) => ({
                ...d,
                model_jailbreak_threshold: Math.max(0.5, Math.min(0.99, Number(e.target.value) || 0.8)),
              }))} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Advanced detection — trained-classifier endpoint + cross-tenant guard
// ---------------------------------------------------------------------------

type AdvDraft = {
  enable_trained_classifier: boolean;
  classifier_endpoint_url: string;
  classifier_api_key: string;
  classifier_threshold: number;
  classifier_action: "block" | "flag";
  classifier_shadow_mode: boolean;
  enable_cross_tenant_guard: boolean;
  cross_tenant_action: "block" | "flag";
};

export function AdvancedDetectionSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const snapshot: AdvDraft = useMemo(() => {
    const s = settingsQ.data?.settings ?? {};
    const t = Number(s.classifier_threshold);
    return {
      enable_trained_classifier: !!s.enable_trained_classifier,
      classifier_endpoint_url: typeof s.classifier_endpoint_url === "string" ? s.classifier_endpoint_url : "",
      classifier_api_key: typeof s.classifier_api_key === "string" ? s.classifier_api_key : "",
      classifier_threshold: t >= 0.5 && t <= 0.99 ? t : 0.8,
      classifier_action: (["block", "flag"].includes(s.classifier_action) ? s.classifier_action : "block") as AdvDraft["classifier_action"],
      classifier_shadow_mode: s.classifier_shadow_mode !== false,
      enable_cross_tenant_guard: !!s.enable_cross_tenant_guard,
      cross_tenant_action: (["block", "flag"].includes(s.cross_tenant_action) ? s.cross_tenant_action : "flag") as AdvDraft["cross_tenant_action"],
    };
  }, [settingsQ.data]);

  const [draft, setDraft] = useState<AdvDraft>(snapshot);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot);

  const save = useMutation({
    mutationFn: () => call("save_policy_settings", {
      body: {
        enable_trained_classifier: draft.enable_trained_classifier,
        classifier_endpoint_url: draft.classifier_endpoint_url,
        classifier_api_key: draft.classifier_api_key,
        classifier_threshold: draft.classifier_threshold,
        classifier_action: draft.classifier_action,
        classifier_shadow_mode: draft.classifier_shadow_mode,
        enable_cross_tenant_guard: draft.enable_cross_tenant_guard,
        cross_tenant_action: draft.cross_tenant_action,
      },
    }),
    onSuccess: () => { toast.success("Advanced detection saved"); qc.invalidateQueries({ queryKey: ["policy_settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card className="surface-1 border-border">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 text-primary p-2"><Sparkles className="h-4 w-4" /></div>
            <div>
              <div className="text-h2 font-medium">Advanced detection</div>
              <p className="text-meta text-muted-foreground mt-1 max-w-prose">
                Plug in a trained prompt-injection classifier (ProtectAI, Llama Prompt Guard, or your
                own endpoint), and turn on the best-effort cross-tenant leak guard for responses.
              </p>
            </div>
          </div>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
            <Label className="text-body">Enable trained classifier</Label>
            <Switch checked={draft.enable_trained_classifier}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enable_trained_classifier: v }))} />
          </div>
          <div>
            <Label className="text-meta text-muted-foreground">Inference endpoint URL</Label>
            <Input className="mt-1.5 font-mono text-xs"
              placeholder="https://api-inference.huggingface.co/models/protectai/deberta-v3-base-prompt-injection-v2"
              value={draft.classifier_endpoint_url}
              onChange={(e) => setDraft((d) => ({ ...d, classifier_endpoint_url: e.target.value }))} />
          </div>
          <div>
            <Label className="text-meta text-muted-foreground">Endpoint API key (optional; or set CLASSIFIER_API_KEY in function env)</Label>
            <Input type="password" className="mt-1.5 font-mono text-xs" placeholder="hf_…"
              value={draft.classifier_api_key}
              onChange={(e) => setDraft((d) => ({ ...d, classifier_api_key: e.target.value }))} />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-meta text-muted-foreground">Threshold (0.5–0.99)</Label>
              <Input type="number" min={0.5} max={0.99} step={0.01} className="mt-1.5"
                value={draft.classifier_threshold}
                onChange={(e) => setDraft((d) => ({ ...d, classifier_threshold: Math.max(0.5, Math.min(0.99, Number(e.target.value) || 0.8)) }))} />
            </div>
            <div>
              <Label className="text-meta text-muted-foreground">Action</Label>
              <Select value={draft.classifier_action}
                onValueChange={(v) => setDraft((d) => ({ ...d, classifier_action: v as AdvDraft["classifier_action"] }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="flag">Flag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5 self-end">
              <Label className="text-body">Shadow</Label>
              <Switch checked={draft.classifier_shadow_mode}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, classifier_shadow_mode: v }))} />
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
            <div>
              <Label className="text-body">Cross-tenant guard</Label>
              <p className="text-meta text-muted-foreground">Flag identity/session tokens leaking into responses.</p>
            </div>
            <Switch checked={draft.enable_cross_tenant_guard}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enable_cross_tenant_guard: v }))} />
          </div>
          <div>
            <Label className="text-meta text-muted-foreground">Cross-tenant action</Label>
            <Select value={draft.cross_tenant_action}
              onValueChange={(v) => setDraft((d) => ({ ...d, cross_tenant_action: v as AdvDraft["cross_tenant_action"] }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flag">Flag</SelectItem>
                <SelectItem value="block">Block</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
