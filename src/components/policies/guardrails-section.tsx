import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Save, Undo2, Lock, EyeOff, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KeywordChipInput } from "@/components/keyword-chip-input";
import { useDashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Policies → Guardrails
 *
 * Combined admin control for top-level guardrail levers:
 *  - Workspace toggle that allows API callers to inject a per-request
 *    `system_prompt` (gated by per-key admin flag in the proxy), plus
 *    its tunable max length.
 *  - Zero-Knowledge (ZK) Compliance Logs: purges prompts, responses, and message
 *    arrays from request logs, replacing them with secure SHA-256 validation hashes.
 *  - Workspace blocked / allowed keyword lists used by the deterministic
 *    keyword layer.
 */

type Draft = {
  allow_client_system_prompt: boolean;
  system_prompt_max_length: number;
  blocked_keywords: string[];
  allowed_keywords: string[];
  use_global_defaults: boolean;
  enable_metadata_only_logs: boolean;
};

const EMPTY: Draft = {
  allow_client_system_prompt: false,
  system_prompt_max_length: 16000,
  blocked_keywords: [],
  allowed_keywords: [],
  use_global_defaults: true,
  enable_metadata_only_logs: false,
};

function clampMax(n: number): number {
  if (!Number.isFinite(n)) return 16000;
  return Math.max(100, Math.min(64000, Math.floor(n)));
}

function eq(a: Draft, b: Draft): boolean {
  return (
    a.allow_client_system_prompt === b.allow_client_system_prompt &&
    a.system_prompt_max_length === b.system_prompt_max_length &&
    a.use_global_defaults === b.use_global_defaults &&
    a.enable_metadata_only_logs === b.enable_metadata_only_logs &&
    a.blocked_keywords.length === b.blocked_keywords.length &&
    a.allowed_keywords.length === b.allowed_keywords.length &&
    a.blocked_keywords.every((w, i) => w === b.blocked_keywords[i]) &&
    a.allowed_keywords.every((w, i) => w === b.allowed_keywords[i])
  );
}

export function GuardrailsSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });
  const policiesQ = useQuery<{ policies: any; global_defaults: string[] }>({
    queryKey: ["policies"],
    queryFn: () => call("get_policies"),
  });

  const snapshot: Draft = useMemo(() => {
    const s = settingsQ.data?.settings;
    const p = policiesQ.data?.policies;
    if (!s && !p) return EMPTY;
    return {
      allow_client_system_prompt: !!s?.allow_client_system_prompt,
      system_prompt_max_length: clampMax(Number(s?.system_prompt_max_length) || 16000),
      blocked_keywords: Array.isArray(p?.blocked_keywords) ? p.blocked_keywords : [],
      allowed_keywords: Array.isArray(p?.allowed_keywords) ? p.allowed_keywords : [],
      use_global_defaults: p?.use_global_defaults !== false,
      enable_metadata_only_logs: !!s?.enable_metadata_only_logs,
    };
  }, [settingsQ.data, policiesQ.data]);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);

  const dirty = !eq(draft, snapshot);
  const isLoading = settingsQ.isLoading || policiesQ.isLoading;

  const save = useMutation({
    mutationFn: async () => {
      await Promise.all([
        call("save_policy_settings", {
          body: {
            allow_client_system_prompt: draft.allow_client_system_prompt,
            system_prompt_max_length: draft.system_prompt_max_length,
            enable_metadata_only_logs: draft.enable_metadata_only_logs,
          },
        }),
        call("save_policies", {
          body: {
            blocked_keywords: draft.blocked_keywords,
            allowed_keywords: draft.allowed_keywords,
            use_global_defaults: draft.use_global_defaults,
          },
        }),
      ]);
    },
    onSuccess: () => {
      toast.success("Guardrails saved", {
        description: `Settings updated successfully. Zero-knowledge is ${draft.enable_metadata_only_logs ? "active" : "inactive"}.`,
      });
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
      qc.invalidateQueries({ queryKey: ["policies"] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Failed to save guardrails", {
        description: "Reverting to the last saved state.",
        action: { label: "Keep edits", onClick: () => { /* no-op: leave draft */ } },
      });
      setDraft(snapshot);
    },
  });

  const rollback = () => {
    setDraft(snapshot);
    toast("Reverted unsaved changes", {
      description: "All fields restored to the last saved state.",
    });
  };

  if (isLoading) {
    return <Skeleton className="h-[420px] rounded-lg" />;
  }

  return (
    <Card className="surface-1 border-border shadow-pop relative overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes cyan-glow {
          0%, 100% { box-shadow: 0 0 5px rgba(6, 182, 212, 0.4), inset 0 0 4px rgba(6, 182, 212, 0.2); opacity: 0.85; border-color: rgba(6, 182, 212, 0.5); }
          50% { box-shadow: 0 0 15px rgba(6, 182, 212, 0.8), inset 0 0 8px rgba(6, 182, 212, 0.4); opacity: 1; border-color: rgba(6, 182, 212, 0.8); }
        }
        .cyan-pulse {
          animation: cyan-glow 2.5s infinite ease-in-out;
        }
      `}} />

      <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3 bg-gradient-to-r from-transparent to-primary/5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Workspace Security</div>
          <div className="text-h2 font-semibold mt-0.5 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Guardrails & Compliance
          </div>
          <p className="text-meta text-muted-foreground mt-1 max-w-prose">
            Workspace-wide governance: system prompt injections, zero-knowledge privacy standards, and keyword filtering.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="outline" className="text-status-warn border-status-warn/40 animate-pulse">Unsaved changes</Badge>}
          <Button
            size="sm"
            variant="outline"
            onClick={rollback}
            disabled={!dirty || save.isPending}
            className="hover:bg-muted"
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Rollback
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="shadow-glow"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <CardContent className="p-5 space-y-6">
        
        {/* Zero-Knowledge (ZK) Compliance Logs Card --------------------------- */}
        <div className={cn(
          "rounded-lg border p-4 transition-all duration-300 relative overflow-hidden",
          draft.enable_metadata_only_logs 
            ? "cyan-pulse bg-cyan-950/10 border-cyan-500/40 shadow-glow" 
            : "border-border surface-2"
        )}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className={cn(
                "p-2 rounded-md transition-colors",
                draft.enable_metadata_only_logs ? "bg-cyan-500/20 text-cyan-400" : "bg-muted text-muted-foreground"
              )}>
                <EyeOff className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Label className="text-body font-medium flex items-center gap-1.5 cursor-pointer">
                    Zero-Knowledge (ZK) HIPAA Compliance Logging
                  </Label>
                  {draft.enable_metadata_only_logs && (
                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px] uppercase font-bold tracking-wider">
                      Strict HIPAA Active
                    </Badge>
                  )}
                </div>
                <p className="text-meta text-muted-foreground mt-1 max-w-prose leading-relaxed">
                  When active, full prompts, assistant completion responses, and message objects are <strong className="text-foreground">never written to the database</strong>. 
                  The gateway extracts telemetry metadata and generates secure <code className="font-mono text-cyan-400">SHA-256 hashes</code> of the payloads to enable tamper-proof compliance audits while guaranteeing absolute data privacy.
                </p>
              </div>
            </div>
            <Switch
              checked={draft.enable_metadata_only_logs}
              onCheckedChange={(v) => {
                setDraft((d) => ({ ...d, enable_metadata_only_logs: v }));
                if (v) {
                  toast.info("HIPAA Mode Enabled (Pending Save)", {
                    description: "Raw LLM prompt and response texts will be hashed via SHA-256 instead of persisted.",
                  });
                }
              }}
            />
          </div>
        </div>

        {/* Per-request system_prompt toggle ---------------------------------- */}
        <div className="rounded-lg border border-border surface-2 p-4 transition-all hover:border-border-strong">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className={cn(
                "p-2 rounded-md transition-colors",
                draft.allow_client_system_prompt ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <Lock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <Label className="text-body font-medium">
                  Allow per-request <code className="font-mono text-xs">system_prompt</code> override
                </Label>
                <p className="text-meta text-muted-foreground mt-1 max-w-prose leading-relaxed">
                  Allows API keys flagged as <strong className="text-foreground">admin</strong> to pass a top-level
                  <code className="font-mono text-xs"> system_prompt</code> field in their payloads. The proxy appends it right after workspace guardrails, ensuring compliance rules remain supreme while offering developer flexibility. Off → returns 403 on client overrides.
                </p>
              </div>
            </div>
            <Switch
              checked={draft.allow_client_system_prompt}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, allow_client_system_prompt: v }))}
            />
          </div>
          <div className={cn(
            "mt-4 pt-4 border-t border-border flex items-center justify-between gap-4 transition-all duration-200",
            !draft.allow_client_system_prompt && "opacity-40 pointer-events-none",
          )}>
            <div className="min-w-0 pl-10">
              <Label htmlFor="g-sysmax" className="text-meta font-medium">
                Maximum <code className="font-mono text-xs">system_prompt</code> length limit
              </Label>
              <p className="text-meta text-muted-foreground mt-0.5">
                Range: 100 to 64,000 characters (default: 16,000). Over-limit client overrides reject with 400.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="g-sysmax"
                type="number"
                min={100}
                max={64000}
                step={100}
                value={draft.system_prompt_max_length}
                onChange={(e) => setDraft((d) => ({ ...d, system_prompt_max_length: clampMax(Number(e.target.value)) }))}
                className="w-28 text-right font-mono surface-1 border-border focus-visible:ring-primary"
              />
              <span className="text-meta text-muted-foreground font-medium">chars</span>
            </div>
          </div>
        </div>

        {/* Keyword lists ----------------------------------------------------- */}
        <div className="rounded-lg border border-border surface-2 p-4 space-y-4 transition-all hover:border-border-strong">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className={cn(
                "p-2 rounded-md transition-colors",
                draft.use_global_defaults ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"
              )}>
                <CheckCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <Label className="text-body font-medium">Use AnveGuard global defaults</Label>
                <p className="text-meta text-muted-foreground mt-1 max-w-prose leading-relaxed">
                  Layer curated enterprise keyword blocks under your workspace configuration. Overriding allowed key terms below will take priority over defaults.
                </p>
              </div>
            </div>
            <Switch
              checked={draft.use_global_defaults}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, use_global_defaults: v }))}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-5 pt-2">
            <div>
              <Label htmlFor="g-blocked" className="font-semibold text-meta text-status-block">Blocked keywords</Label>
              <div className="mt-1">
                <KeywordChipInput
                  id="g-blocked"
                  value={draft.blocked_keywords}
                  onChange={(blocked_keywords) => setDraft((d) => ({ ...d, blocked_keywords }))}
                  placeholder="Type a word and hit enter"
                />
              </div>
              <div className="text-meta text-muted-foreground mt-2 font-mono">
                {draft.blocked_keywords.length} items configured
              </div>
            </div>
            <div>
              <Label htmlFor="g-allowed" className="font-semibold text-meta text-status-ok">Allowed exceptions (allowlist)</Label>
              <div className="mt-1">
                <KeywordChipInput
                  id="g-allowed"
                  value={draft.allowed_keywords}
                  onChange={(allowed_keywords) => setDraft((d) => ({ ...d, allowed_keywords }))}
                  placeholder="Type a word and hit enter"
                />
              </div>
              <div className="text-meta text-muted-foreground mt-2 font-mono">
                {draft.allowed_keywords.length} exceptions active
              </div>
            </div>
          </div>

          {draft.use_global_defaults && (policiesQ.data?.global_defaults?.length ?? 0) > 0 && (
            <details className="rounded-md border border-border surface-1 p-3 transition-colors duration-200 hover:border-border-strong">
              <summary className="text-meta text-muted-foreground cursor-pointer font-medium hover:text-foreground transition-colors select-none">
                Preview active global default rules ({policiesQ.data?.global_defaults?.length ?? 0})
              </summary>
              <div className="mt-3 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {(policiesQ.data?.global_defaults ?? []).map((term) => (
                  <Badge key={term} variant="outline" className="font-mono bg-muted/40 border-border/80 text-[11px] py-0.5 px-2 hover:bg-muted transition-colors">
                    {term}
                  </Badge>
                ))}
              </div>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
