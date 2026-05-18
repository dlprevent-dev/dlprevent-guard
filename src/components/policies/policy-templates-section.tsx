import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Beaker, Bot, Building2, Check, Copy, History, Pencil, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TemplateWizardDialog, type WizardInitialTemplate } from "./template-wizard-dialog";
import { TemplateTestDialog } from "./template-test-dialog";
import { TemplateHistoryDialog } from "./template-history-dialog";
import { TemplateApplyPreviewDialog } from "./template-apply-preview-dialog";

type TemplateId = "safe_chatbot" | "enterprise_compliance" | "no_pii" | string;

type Template = {
  id: TemplateId;
  name: string;
  tagline: string;
  icon: React.ReactNode;
  accent: string;
  highlights: string[];
  policy: {
    blocked_keywords?: string[];
    allowed_keywords?: string[];
    use_global_defaults?: boolean;
    block_message?: string;
  };
  settings: Record<string, unknown>;
  rules?: Array<{
    name: string;
    kind: "regex" | "detector";
    severity: "low" | "med" | "high";
    direction: "input" | "output" | "both";
    enabled: boolean;
    config: Record<string, unknown>;
    applies_to_intents?: string[];
  }>;
  applies_to_intents?: string[];
  unknown_intent_fallback?: "apply_no_rules" | "apply_default_rules" | "reject";
  custom?: boolean;
};

const TEMPLATES: Template[] = [
  {
    id: "safe_chatbot",
    name: "Safe chatbot mode",
    tagline: "Friendly defaults for public-facing assistants.",
    icon: <Bot className="h-4 w-4" />,
    accent: "text-primary",
    highlights: [
      "Global keyword defaults on",
      "Injection guard: block",
      "Behavioral throttling: flag",
      "Fuzzy matching enabled",
    ],
    policy: {
      blocked_keywords: [],
      allowed_keywords: [],
      use_global_defaults: true,
      block_message:
        "Sorry, I can't help with that. Please rephrase your request.",
    },
    settings: {
      enable_normalizer: true,
      enable_patterns: true,
      enable_heuristics: true,
      enable_injection_guard: true,
      injection_action: "block",
      enable_behavioral: true,
      behavioral_action: "flag",
      throttle_window_minutes: 5,
      throttle_flag_threshold: 12,
      enable_fuzzy_keywords: true,
      enable_semantic_keywords: false,
      strict_mode: false,
      enable_intent: false,
      intent_shadow_mode: true,
    },
  },
  {
    id: "enterprise_compliance",
    name: "Enterprise compliance mode",
    tagline: "Strict controls for regulated workloads.",
    icon: <Building2 className="h-4 w-4" />,
    accent: "text-amber-500",
    highlights: [
      "Strict mode on",
      "Injection guard + intent classifier",
      "Behavioral action: block",
      "Semantic matching enabled",
    ],
    policy: {
      blocked_keywords: [
        "confidential",
        "internal only",
        "do not share",
        "trade secret",
        "nda",
      ],
      allowed_keywords: [],
      use_global_defaults: true,
      block_message:
        "This request was blocked by your organization's compliance policy.",
    },
    settings: {
      enable_normalizer: true,
      enable_patterns: true,
      enable_heuristics: true,
      enable_injection_guard: true,
      injection_action: "block",
      enable_behavioral: true,
      behavioral_action: "block",
      throttle_window_minutes: 5,
      throttle_flag_threshold: 6,
      enable_fuzzy_keywords: true,
      enable_semantic_keywords: true,
      semantic_threshold: 0.78,
      strict_mode: true,
      enable_intent: true,
      intent_shadow_mode: false,
    },
    rules: [
      {
        name: "Credential shape detector",
        kind: "detector",
        severity: "high",
        direction: "both",
        enabled: true,
        config: { detector: "credential_shape" },
      },
      {
        name: "URL exfiltration",
        kind: "detector",
        severity: "high",
        direction: "output",
        enabled: true,
        config: { detector: "url_exfil" },
      },
    ],
  },
  {
    id: "no_pii",
    name: "No PII leakage mode",
    tagline: "Block emails, phone numbers, SSNs and card data.",
    icon: <ShieldCheck className="h-4 w-4" />,
    accent: "text-emerald-500",
    highlights: [
      "PII regex rules (email, phone, SSN, card)",
      "Output direction enforcement",
      "Injection guard: block",
      "Strict mode on",
    ],
    policy: {
      blocked_keywords: [],
      allowed_keywords: [],
      use_global_defaults: true,
      block_message:
        "This response was blocked because it may contain personal information.",
    },
    settings: {
      enable_normalizer: true,
      enable_patterns: true,
      enable_heuristics: true,
      enable_injection_guard: true,
      injection_action: "block",
      enable_behavioral: true,
      behavioral_action: "flag",
      enable_fuzzy_keywords: true,
      enable_semantic_keywords: false,
      strict_mode: true,
      enable_intent: false,
      intent_shadow_mode: true,
    },
    rules: [
      {
        name: "PII — Email address",
        kind: "regex",
        severity: "high",
        direction: "both",
        enabled: true,
        config: {
          pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
          flags: "i",
        },
      },
      {
        name: "PII — Phone number",
        kind: "regex",
        severity: "high",
        direction: "both",
        enabled: true,
        config: {
          pattern:
            "(?:\\+?\\d{1,3}[\\s.-]?)?(?:\\(?\\d{3}\\)?[\\s.-]?)\\d{3}[\\s.-]?\\d{4}",
          flags: "",
        },
      },
      {
        name: "PII — US SSN",
        kind: "regex",
        severity: "high",
        direction: "both",
        enabled: true,
        config: { pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b", flags: "" },
      },
      {
        name: "PII — Credit card",
        kind: "regex",
        severity: "high",
        direction: "both",
        enabled: true,
        config: {
          pattern: "\\b(?:\\d[ -]*?){13,16}\\b",
          flags: "",
        },
      },
      {
        name: "Credential shape",
        kind: "detector",
        severity: "high",
        direction: "both",
        enabled: true,
        config: { detector: "credential_shape" },
      },
    ],
  },
];

export function PolicyTemplatesSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Template | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testTpl, setTestTpl] = useState<Template | null>(null);
  const [historyTpl, setHistoryTpl] = useState<Template | null>(null);

  const customQ = useQuery<{ templates: any[] }>({
    queryKey: ["policy_templates"],
    queryFn: () => call("list_policy_templates"),
  });

  const apply = useMutation({
    mutationFn: async (tpl: Template) => {
      setPending(tpl.id);
      if (tpl.policy && Object.keys(tpl.policy).length) {
        await call("save_policies", { body: tpl.policy });
      }
      if (tpl.settings && Object.keys(tpl.settings).length) {
        await call("save_policy_settings", { body: tpl.settings });
      }
      if (tpl.rules?.length) {
        for (const rule of tpl.rules) {
          await call("save_policy_rule", {
            body: { ...rule, applies_to_intents: rule.applies_to_intents ?? [] },
          });
        }
      }
    },
    onSuccess: (_d, tpl) => {
      toast.success(`Applied "${tpl.name}"`);
      qc.invalidateQueries({ queryKey: ["policies"] });
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
      qc.invalidateQueries({ queryKey: ["policy_rules"] });
      setConfirm(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to apply template"),
    onSettled: () => setPending(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => call("delete_policy_template", { body: { id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["policy_templates"] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete template"),
  });

  const customTemplates: Template[] = (customQ.data?.templates ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    tagline: t.description || "Custom template",
    icon: <User className="h-4 w-4" />,
    accent: "text-foreground",
    highlights: [
      `${Array.isArray(t.rules) ? t.rules.length : 0} rule${(Array.isArray(t.rules) ? t.rules.length : 0) === 1 ? "" : "s"}`,
      `${Object.keys(t.settings ?? {}).length} setting${Object.keys(t.settings ?? {}).length === 1 ? "" : "s"}`,
      ((t.policy?.blocked_keywords?.length ?? 0) + (t.policy?.allowed_keywords?.length ?? 0))
        ? `${(t.policy?.blocked_keywords?.length ?? 0) + (t.policy?.allowed_keywords?.length ?? 0)} keywords`
        : "No keyword snapshot",
      Array.isArray(t.applies_to_intents) && t.applies_to_intents.length
        ? `Intents: ${t.applies_to_intents.slice(0, 3).join(", ")}${t.applies_to_intents.length > 3 ? "…" : ""}`
        : "All intents",
      `Unknown intent → ${
        t.unknown_intent_fallback === "reject" ? "reject"
        : t.unknown_intent_fallback === "apply_default_rules" ? "apply rules"
        : "skip rules"
      }`,
    ],
    policy: t.policy ?? {},
    settings: t.settings ?? {},
    rules: Array.isArray(t.rules) ? t.rules : [],
    applies_to_intents: Array.isArray(t.applies_to_intents) ? t.applies_to_intents : [],
    unknown_intent_fallback: t.unknown_intent_fallback ?? "apply_no_rules",
    custom: true,
  } as Template & { custom?: boolean }));

  return (
    <>
      <Card className="surface-1 border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-meta uppercase tracking-wide text-muted-foreground">
                  Quick start
                </span>
              </div>
              <h3 className="text-display">Policy templates</h3>
              <p className="text-body text-muted-foreground">
                Pre-built configurations you can apply in one click, or save your
                own from the rules and settings you've already configured.
              </p>
            </div>
            <Button size="sm" onClick={() => setWizardOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New template
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            {TEMPLATES.map((tpl) => {
              const isPending = pending === tpl.id;
              return (
                <div
                  key={tpl.id}
                  className="rounded-lg border border-border surface-2 p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center justify-center h-7 w-7 rounded-md border border-border surface-1", tpl.accent)}>
                      {tpl.icon}
                    </span>
                    <div className="font-medium text-body">{tpl.name}</div>
                  </div>
                  <p className="text-meta text-muted-foreground">{tpl.tagline}</p>
                  <ul className="space-y-1.5 text-meta">
                    {tpl.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-1.5">
                        <Check className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  {tpl.rules?.length ? (
                    <Badge variant="outline" className="w-fit text-meta">
                      +{tpl.rules.length} rule{tpl.rules.length === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                  <div className="mt-auto pt-1 flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={isPending || apply.isPending}
                      onClick={() => setConfirm(tpl)}
                    >
                      {isPending ? "Applying…" : "Apply template"}
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setTestTpl(tpl)}
                      title="Test prompts"
                    >
                      <Beaker className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {customTemplates.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <span className="text-meta uppercase tracking-wide text-muted-foreground pt-3">
                  Your templates
                </span>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {customTemplates.map((tpl) => {
                  const isPending = pending === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      className="rounded-lg border border-border surface-2 p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn("inline-flex items-center justify-center h-7 w-7 rounded-md border border-border surface-1", tpl.accent)}>
                            {tpl.icon}
                          </span>
                          <div className="font-medium text-body truncate">{tpl.name}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => setHistoryTpl(tpl)}
                            title="Version history"
                          >
                            <History className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => setDeleteId(tpl.id)}
                            title="Delete template"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-meta text-muted-foreground line-clamp-2">{tpl.tagline}</p>
                      <ul className="space-y-1.5 text-meta">
                        {tpl.highlights.map((h) => (
                          <li key={h} className="flex items-start gap-1.5">
                            <Check className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-auto pt-1 flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={isPending || apply.isPending}
                          onClick={() => setConfirm(tpl)}
                        >
                          {isPending ? "Applying…" : "Apply template"}
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setTestTpl(tpl)}
                          title="Test prompts"
                        >
                          <Beaker className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateWizardDialog open={wizardOpen} onOpenChange={setWizardOpen} />

      <TemplateTestDialog
        open={!!testTpl}
        onOpenChange={(o) => !o && setTestTpl(null)}
        template={testTpl ? {
          id: testTpl.id,
          name: testTpl.name,
          policy: testTpl.policy as Record<string, any>,
          settings: testTpl.settings as Record<string, any>,
          rules: testTpl.rules as Array<Record<string, any>> | undefined,
        } : null}
      />

      <TemplateHistoryDialog
        open={!!historyTpl}
        onOpenChange={(o) => !o && setHistoryTpl(null)}
        templateId={historyTpl?.id ?? null}
        templateName={historyTpl?.name ?? ""}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              The saved snapshot will be removed. Your live policy is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteId) remove.mutate(deleteId); }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemplateApplyPreviewDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        template={confirm ? {
          id: confirm.id,
          name: confirm.name,
          policy: confirm.policy as Record<string, any>,
          settings: confirm.settings as Record<string, any>,
          rules: confirm.rules as Array<Record<string, any>> | undefined,
        } : null}
        applying={apply.isPending}
        onConfirm={() => { if (confirm) apply.mutate(confirm); }}
      />
    </>
  );
}
