import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PoliciesV2Crud } from "@/components/policies/policies-v2-crud";
import { PolicyTemplatesSection } from "@/components/policies/policy-templates-section";
import { KnownIntentsSection } from "@/components/policies/known-intents-section";
import { GuardrailsSection } from "@/components/policies/guardrails-section";
import { CompressionSection } from "@/components/policies/compression-section";
import { TokenAlertsSection } from "@/components/policies/token-alerts-section";
import { ToolGovernanceSection, EgressSection, ModelClassifierSection, AdvancedDetectionSection } from "@/components/policies/governance-sections";
import { ChevronDown, FlaskConical, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// Every section is always available — the page stays calm because
// everything except Guardrails is collapsed by default.
const SECTIONS = [
  { id: "guardrails",  label: "Guardrails",        hint: "What's blocked, allowed, and flagged",   Component: GuardrailsSection },
  { id: "tool-governance", label: "Tool governance", hint: "Allow / deny which tools the model calls", Component: ToolGovernanceSection },
  { id: "egress",      label: "Egress allowlist",  hint: "Restrict outbound domains + block SSRF",  Component: EgressSection },
  { id: "model-classifier", label: "Model classifier", hint: "Optional LLM jailbreak detector",     Component: ModelClassifierSection },
  { id: "advanced",    label: "Advanced detection", hint: "Trained classifier + cross-tenant guard", Component: AdvancedDetectionSection },
  { id: "compression", label: "Compression",       hint: "Trim noisy prompts before forwarding",   Component: CompressionSection },
  { id: "alerts",      label: "Alerts",            hint: "Get notified on block / token spikes",   Component: TokenAlertsSection },
  { id: "templates",   label: "Templates",         hint: "Saved policy bundles you can re-apply",  Component: PolicyTemplatesSection },
  { id: "intents",     label: "Known intents",     hint: "Catalog of intents your classifier sees", Component: KnownIntentsSection },
  { id: "rules",       label: "Rules & detectors", hint: "Regex + structural detectors",           Component: PoliciesV2Crud },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const OPEN_KEY = "anveguard.policies.open_sections";
const DEFAULT_OPEN: Record<SectionId, boolean> = {
  guardrails: true,
  "tool-governance": false,
  egress: false,
  "model-classifier": false,
  advanced: false,
  compression: false,
  alerts: false,
  templates: false,
  intents: false,
  rules: false,
};

function loadOpenState(): Record<SectionId, boolean> {
  if (typeof window === "undefined") return { ...DEFAULT_OPEN };
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return { ...DEFAULT_OPEN };
    const parsed = JSON.parse(raw) as Partial<Record<SectionId, boolean>>;
    return { ...DEFAULT_OPEN, ...parsed };
  } catch {
    return { ...DEFAULT_OPEN };
  }
}

const Policies = () => {
  const [open, setOpen] = useState<Record<SectionId, boolean>>(() => loadOpenState());

  // Persist open/closed state so a user who opens Alerts once doesn't have
  // to re-open it on every visit.
  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch { /* private mode */ }
  }, [open]);

  // Deep-link: /dashboard/policies#intents auto-opens that section and
  // scrolls it into view. Preserves existing links from other pages.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "") as SectionId;
    if (!hash) return;
    if (!SECTIONS.some((s) => s.id === hash)) return;
    setOpen((prev) => (prev[hash] ? prev : { ...prev, [hash]: true }));
    // Defer scroll until after the section mounts.
    requestAnimationFrame(() => {
      document.getElementById(`section-${hash}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const toggle = (id: SectionId) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="px-4 md:px-6 py-5 space-y-3 max-w-6xl mx-auto">
      <PageHeader
        title="Policies"
        description="What AnveGuard blocks, flags, or sanitizes for your workspace."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href="/dashboard/policies/sandbox" aria-label="Open the policy sandbox">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Test in sandbox
            </a>
          </Button>
        }
      />

      <div className="space-y-2">
        {SECTIONS.map(({ id, label, hint, Component }) => {
          const isOpen = !!open[id];
          return (
            <Collapsible
              key={id}
              open={isOpen}
              onOpenChange={() => toggle(id)}
              id={`section-${id}`}
              className="rounded-md border border-border bg-surface-1 overflow-hidden"
            >
              <CollapsibleTrigger
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
                  "hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2",
                )}
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${label} section`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Shield className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-body font-medium text-foreground">{label}</div>
                    <div className="text-meta text-muted-foreground truncate">{hint}</div>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border p-4 bg-background">
                  <Component />
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};

export default Policies;
