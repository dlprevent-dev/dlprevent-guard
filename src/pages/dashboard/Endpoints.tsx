import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonBlock, SkeletonRows } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Plug, Pencil, Trash2, X, Check, Beaker, KeyRound, RefreshCw, AlertTriangle, Activity, Ban, AlertCircle, Download, Upload, Save, ChevronRight, Copy } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { HelpPanel } from "@/components/help-panel";
import { HelpHint } from "@/components/help-hint";

// -------- Endpoint form validation -----------------------------------------
// Validates the fields a template prefills (and that the upstream actually
// needs) BEFORE allowing Test or Save. Mirrors the server-side checks in the
// `save_endpoint` action so users get instant inline feedback rather than a
// generic API error after submitting.
//
// Rules:
// - name + base_url required, base_url must parse as http(s) URL.
// - For non-"none" auth schemes, an auth_header/param name is required.
// - Path overrides (path_prefix, chat_path, models_path, models_url) must be
//   either empty or syntactically valid (start with "/" or be absolute URL).
// - default_model is recommended but not required (warning, not error).
const PathOverride = z
  .string()
  .max(500, "Too long")
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v),
    { message: "Must start with '/' or be a full http(s) URL" },
  );

const endpointFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name must be ≤120 chars"),
    base_url: z
      .string()
      .trim()
      .min(1, "Base URL is required")
      .max(500, "Base URL too long")
      .refine((v) => {
        try {
          const u = new URL(v);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch { return false; }
      }, "Must be a valid http(s) URL"),
    kind: z.string().min(1, "Kind is required"),
    auth_scheme: z.string().min(1, "Auth scheme is required"),
    auth_header: z.string().trim().max(120, "Header name too long"),
    response_format: z.enum(["chat_completions", "responses", "anthropic_messages"], {
      message: "Pick a response format",
    }),
    models_url: PathOverride,
    path_prefix: PathOverride,
    chat_path: PathOverride,
    models_path: PathOverride,
    default_model: z.string().trim().max(200, "Model id too long"),
  })
  .superRefine((v, ctx) => {
    // Auth header/param name is mandatory for any scheme that uses one.
    if (v.auth_scheme !== "none" && v.auth_scheme !== "bearer" && v.auth_scheme !== "x-api-key") {
      if (!v.auth_header.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["auth_header"],
          message: v.auth_scheme === "query"
            ? "Query parameter name is required for 'query' auth"
            : "Header name is required for 'header' auth",
        });
      }
    }
    // Anthropic kind only makes sense with anthropic_messages format.
    if (v.kind === "anthropic" && v.response_format !== "anthropic_messages") {
      ctx.addIssue({
        code: "custom", path: ["response_format"],
        message: "Anthropic kind requires the 'anthropic_messages' response format",
      });
    }
  });

type EndpointFormErrors = Partial<Record<
  "name" | "base_url" | "kind" | "auth_scheme" | "auth_header" | "response_format"
  | "models_url" | "path_prefix" | "chat_path" | "models_path" | "default_model",
  string
>>;

interface CustomSchema {
  kinds: { id: string; label: string }[];
  auth_schemes: { id: string; label: string }[];
  templates: {
    id: string;
    label: string;
    description?: string;
    category?: "managed" | "hosted" | "self_hosted";
    managed?: boolean;
    values: {
      kind: string;
      base_url: string;
      auth_scheme: string;
      auth_header?: string;
      default_model?: string;
      model_suggestions?: string;
      models_url?: string;
      path_prefix?: string;
      chat_path?: string;
      models_path?: string;
      response_format?: string;
      extra_headers?: Record<string, string>;
    };
  }[];
}

interface EndpointRow {
  id: string;
  name: string;
  base_url: string;
  models_url: string | null;
  kind: string;
  auth_scheme: string;
  auth_header: string | null;
  extra_headers: Record<string, string>;
  model_suggestions: string[];
  default_model: string | null;
  path_prefix: string | null;
  chat_path: string | null;
  models_path: string | null;
  response_format: string | null;
  has_key: boolean;
  key_count?: number;
  updated_at: string;
  is_shared?: boolean;
  permission?: "owner" | "read";
  owner_email?: string | null;
  share_id?: string | null;
  shared_at?: string | null;
}

interface ShareRow {
  id: string;
  shared_with_email: string;
  shared_with_user_id: string | null;
  permission: "read";
  created_at: string;
}

interface FormState {
  id?: string;
  template: string;
  name: string;
  base_url: string;
  models_url: string;
  kind: string;
  auth_scheme: string;
  auth_header: string;
  default_model: string;
  model_suggestions: string;
  provider_key: string;
  clear_provider_key: boolean;
  extra_headers: { key: string; value: string }[];
  path_prefix: string;
  chat_path: string;
  models_path: string;
  response_format: string;
}

const emptyForm: FormState = {
  template: "",
  name: "",
  base_url: "",
  models_url: "",
  kind: "openai_compatible",
  auth_scheme: "bearer",
  auth_header: "Authorization",
  default_model: "",
  model_suggestions: "",
  provider_key: "",
  clear_provider_key: false,
  extra_headers: [],
  path_prefix: "",
  chat_path: "",
  models_path: "",
  response_format: "chat_completions",
};

// Time-range presets for the endpoint usage dialog. Mirrors the values
// accepted by the `endpoint_usage` action's `range` parameter.
type UsageRange = "1h" | "24h" | "7d" | "30d" | "90d" | "all";
const USAGE_RANGES: { value: UsageRange; label: string; longLabel: string }[] = [
  { value: "1h", label: "1h", longLabel: "the last 1 hour" },
  { value: "24h", label: "24h", longLabel: "the last 24 hours" },
  { value: "7d", label: "7d", longLabel: "the last 7 days" },
  { value: "30d", label: "30d", longLabel: "the last 30 days" },
  { value: "90d", label: "90d", longLabel: "the last 90 days" },
  { value: "all", label: "All", longLabel: "all time" },
];

const Endpoints = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<{ endpoints: EndpointRow[]; shared_endpoints?: EndpointRow[] }>("list_endpoints"),
  });
  const { data: provData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => call<{ providers: any[]; custom_schema: CustomSchema }>("list_providers"),
  });
  const customSchema = provData?.custom_schema;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<EndpointRow | null>(null);
  const [usageEndpoint, setUsageEndpoint] = useState<EndpointRow | null>(null);
  // Rolling window applied to both the stats tiles and the recent requests
  // list inside the usage dialog. Resets to "24h" each time the dialog is
  // (re-)opened so users get a predictable starting view.
  const [usageRange, setUsageRange] = useState<UsageRange>("24h");
  useEffect(() => {
    if (usageEndpoint) setUsageRange("24h");
  }, [usageEndpoint?.id]);

  const usageQuery = useQuery({
    enabled: !!usageEndpoint,
    queryKey: ["endpoint_usage", usageEndpoint?.id, usageRange],
    queryFn: () => call<{ usage: any[]; range: UsageRange; since: string | null }>("endpoint_usage", {
      query: { endpoint_id: usageEndpoint!.id, limit: "25", range: usageRange },
    }),
  });
  const usageRow = usageQuery.data?.usage?.[0];

  // Deep-link from the global ⌘K palette: `?focus=<endpoint_id>` opens that
  // endpoint's usage dialog as soon as the list resolves, then strips the
  // param so refresh/back doesn't repeat the action.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focusId = searchParams.get("focus");
    if (!focusId || !data?.endpoints) return;
    const hit =
      data.endpoints.find((e) => e.id === focusId) ??
      data.shared_endpoints?.find((e) => e.id === focusId);
    if (hit) {
      setUsageEndpoint(hit);
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  }, [data, searchParams, setSearchParams]);

  // Inline revoke (with confirm step) for keys shown in the usage dialog.
  // Reuses the existing `revoke_key` action, which enforces ownership and
  // is idempotent server-side. On success we invalidate the usage query so
  // the row updates in place, and the global keys list so the Keys page
  // stays in sync.
  const [confirmRevokeKey, setConfirmRevokeKey] = useState<{
    id: string;
    name: string;
    key_prefix: string;
    last_used_at: string | null;
    last_model: string | null;
  } | null>(null);
  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => call("revoke_key", { body: { id } }),
    onSuccess: () => {
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["endpoint_usage"] });
      qc.invalidateQueries({ queryKey: ["keys"] });
      setConfirmRevokeKey(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to revoke key"),
  });

  // Drilldown for individual request_log rows in the usage dialog.
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const requestDetailQuery = useQuery({
    enabled: !!openRequestId,
    queryKey: ["endpoint_request_detail", openRequestId],
    queryFn: () => call<{ request: any }>("endpoint_request_detail", {
      body: { request_id: openRequestId },
    }),
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
    checks?: { name: string; ok: boolean; detail?: string }[];
    chat_probe?: { ok: boolean; status?: number; latency_ms?: number; model?: string; error?: string | null } | null;
  } | null>(null);
  const [probeChat, setProbeChat] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [modelsResult, setModelsResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // True only when the most recent upstream /models fetch succeeded with `source: "live"`.
  // Persisting `default_model` is gated on this so we never silently save a stale picker.
  const [lastRefreshOk, setLastRefreshOk] = useState(false);
  // Tracks the `default_model` currently stored on the endpoint record so the
  // "Save as default" button can show a dirty state and disable when unchanged.
  const [savedDefaultModel, setSavedDefaultModel] = useState<string>("");
  const [savingDefault, setSavingDefault] = useState(false);
  // Template preview — selecting a template in the dropdown doesn't immediately
  // overwrite the form. It populates this state instead, which renders a diff
  // panel so the user can review every field before confirming "Apply".
  const [previewTemplateId, setPreviewTemplateId] = useState<string>("");
  // Form mode: Simple shows just name/key/model; Advanced is the full form.
  const [formMode, setFormMode] = useState<"simple" | "advanced">("advanced");

  // Auto-create AnveGuard key alongside a new endpoint. Defaults ON for
  // detected providers (Perplexity etc.) so users can hit /v1 immediately.
  const [autoCreateKey, setAutoCreateKey] = useState(true);
  const [autoKeyName, setAutoKeyName] = useState("");
  const [autoKeyIsAdmin, setAutoKeyIsAdmin] = useState(false);
  // Set after a successful endpoint+key chain so the dialog can reveal the
  // one-time `ag_live_…` secret with a copy button + Playground deep-link.
  const [createdKey, setCreatedKey] = useState<{
    id: string;
    full_key: string;
    endpoint_id: string;
    endpoint_name: string;
  } | null>(null);

  const isEdit = !!form.id;

  const detectedAutoProvider = useMemo(() => {
    const host = (() => { try { return new URL(form.base_url).host.toLowerCase(); } catch { return ""; } })();
    if (!host) return null;
    if (host.includes("perplexity.ai")) return "Perplexity";
    return null;
  }, [form.base_url]);

  const startCreate = (templateId?: string) => {
    setForm(emptyForm);
    setTestResult(null);
    setLiveModels(null);
    setModelsResult(null);
    setLastRefreshOk(false);
    setSavedDefaultModel("");
    setPreviewTemplateId("");
    setFormMode(templateId ? "simple" : "advanced");
    setAutoCreateKey(true);
    setAutoKeyName("");
    setAutoKeyIsAdmin(false);
    setCreatedKey(null);
    setOpen(true);
    if (templateId) {
      // Defer so emptyForm settles, then apply the template inline.
      setTimeout(() => applyTemplate(templateId), 0);
    }
  };

  const startEdit = (e: EndpointRow) => {
    setForm({
      id: e.id,
      template: "",
      name: e.name,
      base_url: e.base_url,
      models_url: e.models_url ?? "",
      kind: e.kind,
      auth_scheme: e.auth_scheme,
      auth_header: e.auth_header || "Authorization",
      default_model: e.default_model ?? "",
      model_suggestions: (e.model_suggestions || []).join(", "),
      provider_key: "",
      clear_provider_key: false,
      extra_headers: Object.entries(e.extra_headers || {}).map(([key, value]) => ({ key, value })),
      path_prefix: e.path_prefix ?? "",
      chat_path: e.chat_path ?? "",
      models_path: e.models_path ?? "",
      response_format: e.response_format ?? (e.kind === "anthropic" ? "anthropic_messages" : "chat_completions"),
    });
    setTestResult(null);
    setLiveModels(null);
    setModelsResult(null);
    setLastRefreshOk(false);
    setSavedDefaultModel(e.default_model ?? "");
    setPreviewTemplateId("");
    setFormMode("advanced");
    setOpen(true);
  };

  const applyTemplate = (templateId: string) => {
    const t = customSchema?.templates.find((x) => x.id === templateId);
    if (!t) return;
    const v = t.values;
    const fmt = v.response_format
      || (v.kind === "anthropic" ? "anthropic_messages" : "chat_completions");
    setForm((c) => ({
      ...c,
      template: templateId,
      // Preserve user's chosen Name if they already typed one; otherwise prefill from label.
      name: c.name.trim() ? c.name : t.label,
      kind: v.kind,
      base_url: v.base_url,
      models_url: v.models_url ?? "",
      auth_scheme: v.auth_scheme,
      auth_header: v.auth_header || (v.auth_scheme === "query" ? "key" : "Authorization"),
      default_model: v.default_model || c.default_model,
      model_suggestions: v.model_suggestions || c.model_suggestions,
      path_prefix: v.path_prefix ?? "",
      chat_path: v.chat_path ?? "",
      models_path: v.models_path ?? "",
      response_format: fmt,
      extra_headers: v.extra_headers
        ? Object.entries(v.extra_headers).map(([key, value]) => ({ key, value }))
        : c.extra_headers,
    }));
    setTestResult(null);
    setLiveModels(null);
    setModelsResult(null);
    setLastRefreshOk(false);
    setPreviewTemplateId("");
  };

  // -------- Template diff preview ----------------------------------------
  // Computes a per-field comparison between the current form values and what
  // the selected preview template would set, so the user can review every
  // change before clicking "Apply". Returns rows for ALL fields the template
  // would touch (including unchanged ones) so nothing is hidden.
  type DiffRow = {
    label: string;
    field: keyof FormState;
    current: string;
    next: string;
    status: "unchanged" | "change" | "add";
  };
  const previewDiff = useMemo<{ template: NonNullable<CustomSchema["templates"][number]>; rows: DiffRow[] } | null>(() => {
    if (!previewTemplateId || !customSchema) return null;
    const t = customSchema.templates.find((x) => x.id === previewTemplateId);
    if (!t) return null;
    const v = t.values;
    const fmt = v.response_format
      || (v.kind === "anthropic" ? "anthropic_messages" : "chat_completions");
    const nextHeaderName = v.auth_header || (v.auth_scheme === "query" ? "key" : "Authorization");
    const nextExtraHeaders = v.extra_headers
      ? Object.entries(v.extra_headers).map(([k, val]) => `${k}: ${val}`).join(", ")
      : form.extra_headers.map((h) => `${h.key}: ${h.value}`).join(", ");
    const curExtraHeaders = form.extra_headers.map((h) => `${h.key}: ${h.value}`).join(", ");

    const fields: Array<{ label: string; field: keyof FormState; current: string; next: string }> = [
      { label: "Name",            field: "name",              current: form.name,                 next: form.name.trim() ? form.name : t.label },
      { label: "Kind",            field: "kind",              current: form.kind,                 next: v.kind },
      { label: "Base URL",        field: "base_url",          current: form.base_url,             next: v.base_url },
      { label: "Models URL",      field: "models_url",        current: form.models_url,           next: v.models_url ?? "" },
      { label: "Auth scheme",     field: "auth_scheme",       current: form.auth_scheme,          next: v.auth_scheme },
      { label: "Auth header/param", field: "auth_header",     current: form.auth_header,          next: nextHeaderName },
      { label: "Default model",   field: "default_model",     current: form.default_model,        next: v.default_model || form.default_model },
      { label: "Model suggestions", field: "model_suggestions", current: form.model_suggestions, next: v.model_suggestions || form.model_suggestions },
      { label: "Path prefix",     field: "path_prefix",       current: form.path_prefix,          next: v.path_prefix ?? "" },
      { label: "Chat path",       field: "chat_path",         current: form.chat_path,            next: v.chat_path ?? "" },
      { label: "Models path",     field: "models_path",       current: form.models_path,          next: v.models_path ?? "" },
      { label: "Response format", field: "response_format",   current: form.response_format,      next: fmt },
      { label: "Extra headers",   field: "extra_headers",     current: curExtraHeaders,           next: nextExtraHeaders },
    ];
    const rows: DiffRow[] = fields.map((f) => ({
      ...f,
      status: f.current === f.next ? "unchanged" : (f.current.trim() === "" ? "add" : "change"),
    }));
    return { template: t, rows };
  }, [previewTemplateId, customSchema, form]);

  const changedCount = previewDiff?.rows.filter((r) => r.status !== "unchanged").length ?? 0;
  // When auth scheme changes, give it a sensible default header/param name
  useEffect(() => {
    if (form.auth_scheme === "query" && form.auth_header === "Authorization") {
      setForm((f) => ({ ...f, auth_header: "key" }));
    }
    if (form.auth_scheme === "header" && (form.auth_header === "key" || !form.auth_header)) {
      setForm((f) => ({ ...f, auth_header: "api-key" }));
    }
    if ((form.auth_scheme === "bearer" || form.auth_scheme === "x-api-key" || form.auth_scheme === "none")
        && form.auth_header !== "Authorization") {
      setForm((f) => ({ ...f, auth_header: "Authorization" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.auth_scheme]);

  // Keep response_format consistent with the selected kind by default
  useEffect(() => {
    setForm((f) => {
      if (f.kind === "anthropic" && f.response_format !== "anthropic_messages") {
        return { ...f, response_format: "anthropic_messages" };
      }
      if (f.kind !== "anthropic" && f.response_format === "anthropic_messages") {
        return { ...f, response_format: "chat_completions" };
      }
      return f;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.kind]);

  const buildPayload = () => {
    const extra: Record<string, string> = {};
    for (const h of form.extra_headers) {
      if (h.key.trim() && h.value.trim()) extra[h.key.trim()] = h.value.trim();
    }
    return {
      id: form.id,
      name: form.name.trim(),
      base_url: form.base_url.trim(),
      models_url: form.models_url.trim() || undefined,
      kind: form.kind,
      auth_scheme: form.auth_scheme,
      auth_header: form.auth_header.trim() || (form.auth_scheme === "query" ? "key" : "Authorization"),
      extra_headers: extra,
      model_suggestions: form.model_suggestions.split(",").map((s) => s.trim()).filter(Boolean),
      default_model: form.default_model.trim() || undefined,
      provider_key: form.provider_key || undefined,
      clear_provider_key: form.clear_provider_key,
      path_prefix: form.path_prefix.trim() || undefined,
      chat_path: form.chat_path.trim() || undefined,
      models_path: form.models_path.trim() || undefined,
      response_format: form.response_format || undefined,
    };
  };

  const requiresKey = form.auth_scheme !== "none";
  const hasKeyOnRecord = isEdit && data?.endpoints.find((e) => e.id === form.id)?.has_key;

  // Validate the template-prefilled fields on every change. Errors are surfaced
  // inline next to each field AND in a summary banner above the action buttons.
  // Both Test connection and Save are gated on `validation.success` so users
  // can't fire half-configured requests at upstream providers.
  const validation = useMemo(() => {
    const r = endpointFormSchema.safeParse(form);
    if (r.success) return { success: true as const, errors: {} as EndpointFormErrors };
    const errors: EndpointFormErrors = {};
    for (const issue of r.error.issues) {
      const key = issue.path[0] as keyof EndpointFormErrors | undefined;
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return { success: false as const, errors };
  }, [form]);

  const errorEntries = Object.entries(validation.errors) as Array<[keyof EndpointFormErrors, string]>;
  const FIELD_LABELS: Record<keyof EndpointFormErrors, string> = {
    name: "Name", base_url: "Base URL", kind: "Kind",
    auth_scheme: "Auth scheme", auth_header: "Auth header/param",
    response_format: "Response format",
    models_url: "Models URL", path_prefix: "Path prefix",
    chat_path: "Chat path", models_path: "Models path",
    default_model: "Default model",
  };

  const canSave = validation.success && (!requiresKey || hasKeyOnRecord || !!form.provider_key);
  const canTest = validation.success;

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const base = isEdit && hasKeyOnRecord && !form.provider_key
        ? { id: form.id }
        : buildPayload();
      const r = await call<any>("test_endpoint", {
        body: { ...base, probe_chat: probeChat, probe_model: form.default_model || undefined },
      });
      const fmt = r.response_format ? ` · format: ${r.response_format}` : "";
      const chat = r.chat_url ? `\nChat URL: ${r.chat_url}` : "";
      if (r.ok) {
        setTestResult({
          ok: true,
          checks: r.checks,
          chat_probe: r.chat_probe,
          msg: (r.sample_model
            ? `Connected (${r.latency_ms}ms). ${r.model_count} models · sample: ${r.sample_model}${fmt}`
            : `Connected (${r.status}, ${r.latency_ms}ms).${fmt}`) + chat,
        });
      } else {
        setTestResult({
          ok: false,
          checks: r.checks,
          chat_probe: r.chat_probe,
          msg: r.error || `HTTP ${r.status ?? "?"}`,
        });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    setFetchingModels(true);
    setModelsResult(null);
    setLastRefreshOk(false);
    try {
      const useStoredKey = isEdit && hasKeyOnRecord && !form.provider_key;
      const r = await call<any>("list_endpoint_models", {
        body: useStoredKey
          ? { id: form.id, model_suggestions: form.model_suggestions.split(",").map((s) => s.trim()).filter(Boolean) }
          : buildPayload(),
      });
      const models: string[] = Array.isArray(r.models) ? r.models : [];
      setLiveModels(models);
      const shapeNote = r.shape && r.shape !== "unknown" ? ` · shape: ${r.shape}` : "";
      if (r.source === "live" && models.length) {
        setLastRefreshOk(true);
        setModelsResult({
          ok: true,
          msg: `Loaded ${models.length} model${models.length === 1 ? "" : "s"} from upstream (${r.latency_ms ?? "?"}ms)${shapeNote}.`,
        });
      } else if (models.length) {
        setModelsResult({
          ok: false,
          msg: `${r.error || r.warning || "Upstream unavailable"} — showing ${models.length} fallback suggestion(s)${shapeNote}.`,
        });
      } else {
        setModelsResult({
          ok: false,
          msg: r.error || "Upstream returned no models. Add fallback suggestions below.",
        });
      }
    } catch (e: any) {
      setModelsResult({ ok: false, msg: e.message || String(e) });
    } finally {
      setFetchingModels(false);
    }
  };

  // Persist `default_model` to the saved endpoint record.
  // Gated behind `lastRefreshOk` (a successful live upstream refresh in this session)
  // so we never store a model id that hasn't been confirmed against the provider.
  const persistDefaultModel = async (force = false) => {
    if (!isEdit || !form.id) return;
    const chosen = form.default_model.trim();
    if (!chosen) {
      toast.error("Pick a model first.");
      return;
    }
    setSavingDefault(true);
    try {
      const r = await call<{ ok: boolean; default_model: string; forced?: boolean }>(
        "set_endpoint_default_model",
        { body: { id: form.id, default_model: chosen, force } },
      );
      setSavedDefaultModel(r.default_model);
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      toast.success(
        r.forced
          ? `Saved "${r.default_model}" as default (forced — not in upstream list).`
          : `Saved "${r.default_model}" as default model.`,
      );
    } catch (e: any) {
      // Server returns a structured error message. If it's the "model not in
      // upstream list" case, offer a one-click force-save.
      const msg: string = e?.message || String(e);
      if (!force && /not.*found.*upstream|model_missing/i.test(msg)) {
        toast.error(msg, {
          action: {
            label: "Save anyway",
            onClick: () => persistDefaultModel(true),
          },
          duration: 8000,
        });
      } else if (/upstream_unreachable|upstream_error|parse_failed|empty_list/i.test(msg)) {
        toast.error(`Couldn't verify against upstream: ${msg}. Refresh the model list and try again.`);
      } else {
        toast.error(msg);
      }
    } finally {
      setSavingDefault(false);
    }
  };

  const save = useMutation({
    mutationFn: async (): Promise<{ endpoint_id: string; key?: { id: string; full_key: string; name: string } }> => {
      const ep = await call<{ id: string }>("save_endpoint", { body: buildPayload() });
      // Only chain key creation on first save (create flow) when the user
      // opted in. Edits never auto-create — the option is hidden in that mode.
      if (!isEdit && autoCreateKey) {
        const keyName = (autoKeyName.trim() || `${form.name} key`).slice(0, 120);
        const k = await call<{ id: string; full_key: string }>("create_key", {
          body: {
            name: keyName,
            provider: "custom",
            endpoint_id: ep.id,
            model: form.default_model || undefined,
            is_admin: autoKeyIsAdmin,
          },
        });
        return { endpoint_id: ep.id, key: { id: k.id, full_key: k.full_key, name: keyName } };
      }
      return { endpoint_id: ep.id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      qc.invalidateQueries({ queryKey: ["keys"] });
      if (res.key) {
        // Stay on the dialog so the user can copy the one-time secret.
        setCreatedKey({
          id: res.key.id,
          full_key: res.key.full_key,
          endpoint_id: res.endpoint_id,
          endpoint_name: form.name,
        });
        toast.success(`Endpoint created · key "${res.key.name}" ready to use`);
      } else {
        toast.success(isEdit ? "Endpoint updated" : "Endpoint created");
        setOpen(false);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => call("delete_endpoint", { body: { id } }),
    onSuccess: () => {
      toast.success("Endpoint deleted");
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hostOf = (url: string) => {
    try { return new URL(url).host; } catch { return url; }
  };

  // -------- curl example builder --------
  // Builds copyable curl commands from the current form state for: GET /models
  // and POST chat (chat_completions or anthropic_messages). Auth is applied per
  // the selected scheme; the provider key is shown as a $PROVIDER_KEY shell var
  // so users never paste a real secret into their clipboard from this UI.
  const shQuote = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const joinUrl = (base: string, path: string) => {
    if (!path) return base;
    if (/^https?:\/\//i.test(path)) return path;
    const b = base.replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${b}${p}`;
  };
  const buildCurlExamples = () => {
    const base = form.base_url.trim();
    if (!base) return null;
    const scheme = form.auth_scheme || "bearer";
    const headerName = (form.auth_header || "").trim();
    const prefix = (form.path_prefix || "").replace(/\/+$/, "");
    const modelsPath = (form.models_path || "/models").trim();
    const chatPath = (form.chat_path || (form.kind === "anthropic" ? "/messages" : "/chat/completions")).trim();
    const modelsUrlBase = (form.models_url || "").trim() || joinUrl(base, `${prefix}${modelsPath.startsWith("/") ? "" : "/"}${modelsPath}`);
    const chatUrl = joinUrl(base, `${prefix}${chatPath.startsWith("/") ? "" : "/"}${chatPath}`);

    // Auth wiring
    const headerLines: string[] = [];
    let modelsUrlFinal = modelsUrlBase;
    let chatUrlFinal = chatUrl;
    if (scheme === "bearer") {
      headerLines.push(`-H ${shQuote(`Authorization: Bearer $PROVIDER_KEY`)}`);
    } else if (scheme === "x-api-key") {
      headerLines.push(`-H ${shQuote(`x-api-key: $PROVIDER_KEY`)}`);
    } else if (scheme === "header" && headerName) {
      headerLines.push(`-H ${shQuote(`${headerName}: $PROVIDER_KEY`)}`);
    } else if (scheme === "query" && headerName) {
      const sep = (u: string) => (u.includes("?") ? "&" : "?");
      modelsUrlFinal = `${modelsUrlBase}${sep(modelsUrlBase)}${headerName}=$PROVIDER_KEY`;
      chatUrlFinal = `${chatUrl}${sep(chatUrl)}${headerName}=$PROVIDER_KEY`;
    }

    // Anthropic typically requires an API version header
    if (form.kind === "anthropic" && !form.extra_headers.some((h) => h.key.toLowerCase() === "anthropic-version")) {
      headerLines.push(`-H ${shQuote(`anthropic-version: 2023-06-01`)}`);
    }
    for (const h of form.extra_headers) {
      if (h.key.trim()) headerLines.push(`-H ${shQuote(`${h.key.trim()}: ${h.value}`)}`);
    }

    const indent = " \\\n  ";
    const modelsCmd = [`curl -sS ${shQuote(modelsUrlFinal)}`, ...headerLines].join(indent);

    const model = form.default_model.trim() || "MODEL_ID";
    const isAnthropic = (form.response_format || (form.kind === "anthropic" ? "anthropic_messages" : "chat_completions")) === "anthropic_messages";
    const body = isAnthropic
      ? { model, max_tokens: 64, messages: [{ role: "user", content: "ping" }] }
      : { model, messages: [{ role: "user", content: "ping" }], max_tokens: 64 };
    const jsonBody = JSON.stringify(body);
    const chatCmd = [
      `curl -sS -X POST ${shQuote(chatUrlFinal)}`,
      ...headerLines,
      `-H ${shQuote("Content-Type: application/json")}`,
      `-d ${shQuote(jsonBody)}`,
    ].join(indent);

    return { modelsCmd, chatCmd, needsKey: scheme !== "none" };
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  };

  const endpoints = data?.endpoints ?? [];

  // -------- Export --------
  const [exporting, setExporting] = useState(false);
  const handleExport = async (includeKeys: "none" | "encrypted") => {
    setExporting(true);
    try {
      const r = await call<any>("export_endpoints", { body: { include_keys: includeKeys } });
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `anveguard-endpoints-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${r.count} endpoint${r.count === 1 ? "" : "s"}${includeKeys === "encrypted" ? " (with encrypted keys)" : ""}.`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // -------- Import --------
  const [importOpen, setImportOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<any | null>(null);
  const [importStrategy, setImportStrategy] = useState<"skip" | "rename" | "overwrite">("rename");
  const [acceptKeys, setAcceptKeys] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useMemo(() => ({ current: null as HTMLInputElement | null }), []);

  const onPickFile = () => fileInputRef.current?.click();
  const onFileChosen = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.format && parsed.format !== "anveguard.endpoints") {
        toast.error(`Unexpected file format: ${parsed.format}`);
        return;
      }
      if (!Array.isArray(parsed?.endpoints)) {
        toast.error("File doesn't contain an 'endpoints' array.");
        return;
      }
      setImportPayload(parsed);
      setImportOpen(true);
    } catch (e: any) {
      toast.error(`Couldn't read file: ${e.message || e}`);
    }
  };

  const runImport = async () => {
    if (!importPayload) return;
    setImporting(true);
    try {
      const r = await call<{ imported: number; updated: number; skipped: number; errors: any[] }>(
        "import_endpoints",
        { body: { payload: importPayload, strategy: importStrategy, accept_encrypted_keys: acceptKeys } },
      );
      const parts: string[] = [];
      if (r.imported) parts.push(`${r.imported} imported`);
      if (r.updated) parts.push(`${r.updated} updated`);
      if (r.skipped) parts.push(`${r.skipped} skipped`);
      const summary = parts.join(", ") || "No changes";
      if (r.errors?.length) {
        toast.error(`${summary} · ${r.errors.length} error(s): ${r.errors[0]?.error ?? ""}`);
      } else {
        toast.success(summary);
      }
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      setImportOpen(false);
      setImportPayload(null);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-[1320px] mx-auto">
      <div className="flex items-start justify-between gap-4 pb-1 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold tracking-tight">Custom Endpoints</h1>
          <p className="text-body text-muted-foreground mt-1 max-w-2xl">
            Save self-hosted or third-party LLM endpoints once and reuse them across API keys.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={(el) => { fileInputRef.current = el; }}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onFileChosen(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={onPickFile} disabled={importing}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting || endpoints.length === 0}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={() => handleExport("none")}>
                <div>
                  <div className="font-medium">Without provider keys</div>
                  <div className="text-xs text-muted-foreground">Safe to share. Keys must be re-entered after import.</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport("encrypted")}>
                <div>
                  <div className="font-medium">With encrypted keys</div>
                  <div className="text-xs text-muted-foreground">Only restorable on this same project (server-side secret).</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => startCreate()} size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New endpoint
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-meta flex items-start gap-2">
        <Plug className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <div className="text-muted-foreground">
          <span className="text-foreground font-medium">Most users don't need this page.</span>{" "}
          Use{" "}
          <a href="/dashboard/connect" className="underline hover:text-foreground">
            Connect
          </a>{" "}
          to add OpenAI, Anthropic, OpenRouter, Perplexity, Gemini, Groq, Mistral, Ollama, or
          any OpenAI-compatible endpoint in one click. Endpoints are the advanced escape hatch
          for per-key headers, custom paths, and routes.
        </div>
      </div>

      <HelpPanel
        storageKey="endpoints"
        title="How endpoints work"
        steps={[
          {
            title: "Save the upstream provider once",
            body: "An endpoint stores the base URL, auth scheme, and provider key for any OpenAI-compatible or Anthropic-style API (Perplexity, Together, your own Ollama, etc.).",
          },
          {
            title: "Bind an AnveGuard key to it",
            body: <>Tick <strong>Also create an AnveGuard API key</strong> when adding an endpoint, or use <strong>Bind existing key</strong> on the Keys page. The endpoint config is mirrored onto the key so the proxy reads everything from one row.</>,
          },
          {
            title: "Send through the proxy",
            body: <>Point your client at <code className="font-mono">/proxy/v1/chat/completions</code> with the <code className="font-mono">ag_live_…</code> key — your real provider key never leaves the AnveGuard backend.</>,
          },
        ]}
        examples={[
          {
            label: "Perplexity endpoint config",
            code: `Base URL:        https://api.perplexity.ai
Auth scheme:     bearer
Response format: chat_completions
Default model:   sonar-pro`,
          },
        ]}
      />

      {/* Provider gallery — pre-built templates grouped by category. */}
      {customSchema && customSchema.templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Add an endpoint</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Pick a pre-configured provider to get started in one click, or build a custom endpoint.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {(["managed", "hosted", "self_hosted"] as const).map((cat) => {
              const items = customSchema.templates.filter(
                (t) => (t.category ?? "hosted") === cat,
              );
              if (items.length === 0) return null;
              const heading =
                cat === "managed" ? "Managed"
                : cat === "hosted" ? "Hosted providers"
                : "Self-hosted";
              return (
                <div key={cat}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {heading}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => startCreate(t.id)}
                        className="group text-left rounded-md border border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-colors p-3 flex items-start gap-3"
                      >
                        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                          {t.label.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium truncate">{t.label}</span>
                            {t.managed && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/30">
                                no key needed
                              </Badge>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                              {t.description}
                            </p>
                          )}
                        </div>
                        <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Bring your own
              </h3>
              <button
                type="button"
                onClick={() => startCreate()}
                className="w-full text-left rounded-md border border-dashed border-border hover:border-primary/40 hover:bg-accent/30 transition-colors p-3 flex items-center gap-3"
              >
                <div className="h-8 w-8 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">Custom endpoint</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Configure any OpenAI- or Anthropic-compatible URL by hand (Advanced mode).
                  </p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Saved endpoints</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <SkeletonRows
              rows={3}
              cols="grid-cols-[1fr_auto]"
              rowClassName="h-14 px-0"
              className="!divide-y-0 space-y-2"
            />
          ) : endpoints.length === 0 ? (
            <EmptyState
              icon={<Plug className="h-5 w-5" />}
              title="No endpoints yet"
              description="Pick a provider from the gallery above (OpenAI, Claude, Gemini, OpenRouter, Lovable AI, Ollama, …) or build a custom endpoint."
              action={
                <Button onClick={() => startCreate()} size="sm">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> New endpoint
                </Button>
              }
            />
          ) : (
              <div className="divide-y divide-border">
                {endpoints.map((e) => (
                  <div key={e.id} className="py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{e.name}</p>
                        <Badge variant="outline" className="text-xs font-mono">{hostOf(e.base_url)}</Badge>
                        <Badge variant="secondary" className="text-xs">
                          {e.kind === "anthropic" ? "anthropic" : "openai-compat"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          auth: {e.auth_scheme}
                        </Badge>
                        {e.has_key && (
                          <Badge variant="outline" className="text-xs">
                            <KeyRound className="h-3 w-3 mr-1" /> key stored
                          </Badge>
                        )}
                        {e.key_count > 0 && (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                            {e.key_count} key{e.key_count === 1 ? "" : "s"} using this
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground font-mono truncate">
                        {e.base_url}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setUsageEndpoint(e)} title="View usage">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(e)} title="Edit">
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(e)} title="Delete">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>{isEdit ? "Edit endpoint" : "New endpoint"}</DialogTitle>
              <div className="inline-flex items-center rounded-md border bg-muted/30 p-0.5 shrink-0">
                {(["simple", "advanced"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFormMode(m)}
                    aria-pressed={formMode === m}
                    className={`px-2.5 py-1 text-xs rounded-sm transition-colors capitalize ${
                      formMode === m
                        ? "bg-background text-foreground shadow-sm font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Production Ollama"
                className="mt-1.5"
              />
            </div>

            {formMode === "simple" && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Base URL</span>
                  <code className="font-mono truncate text-foreground">{form.base_url || "—"}</code>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Auth</span>
                  <span className="font-mono text-foreground">{form.auth_scheme}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Format</span>
                  <span className="font-mono text-foreground">{form.response_format}</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/60 mt-2">
                  Need to tweak paths, headers, or response format? Switch to <strong>Advanced</strong>.
                </p>
              </div>
            )}

            {formMode === "advanced" && customSchema && !isEdit && (
              <div className="space-y-2">
                <Label>Template (optional)</Label>
                {/* Selecting a template only stages a preview — nothing is written
                    to the form until the user clicks "Apply changes" below. */}
                <Select value={previewTemplateId} onValueChange={setPreviewTemplateId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Pick a provider to preview which fields will change…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {customSchema.templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex flex-col items-start py-0.5">
                          <span className="font-medium">{t.label}</span>
                          {t.description && (
                            <span className="text-[11px] text-muted-foreground">
                              {t.description}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Live diff preview — shown only while a template is staged */}
                {previewDiff && (
                  <div className="rounded-md border bg-muted/20">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{previewDiff.template.label}</span>
                        <span className="text-muted-foreground">
                          {changedCount === 0
                            ? "No changes — your form already matches this template."
                            : `${changedCount} field${changedCount === 1 ? "" : "s"} will change`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => setPreviewTemplateId("")}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button" size="sm" className="h-7 px-2 text-xs"
                          disabled={changedCount === 0}
                          onClick={() => applyTemplate(previewTemplateId)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Apply changes
                        </Button>
                      </div>
                    </div>
                    <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                      {previewDiff.rows.map((r) => (
                        <li key={r.field as string} className="px-3 py-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                                r.status === "change"
                                  ? "border-primary/40 text-primary"
                                  : r.status === "add"
                                    ? "border-accent/40 text-accent-foreground bg-accent/20"
                                    : "border-border text-muted-foreground"
                              }`}
                            >
                              {r.status}
                            </Badge>
                            <span className="font-medium">{r.label}</span>
                          </div>
                          {r.status === "unchanged" ? (
                            <div className="mt-0.5 ml-12 font-mono text-muted-foreground break-all">
                              {r.current || <span className="italic">(empty)</span>}
                            </div>
                          ) : (
                            <div className="mt-0.5 ml-12 space-y-0.5 font-mono">
                              {r.status === "change" && (
                                <div className="flex gap-1.5">
                                  <span className="text-muted-foreground shrink-0">−</span>
                                  <span className="line-through text-muted-foreground break-all">
                                    {r.current || <span className="italic no-underline">(empty)</span>}
                                  </span>
                                </div>
                              )}
                              <div className="flex gap-1.5">
                                <span className="text-primary shrink-0">+</span>
                                <span className="text-foreground break-all">
                                  {r.next || <span className="italic text-muted-foreground">(empty)</span>}
                                </span>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {form.template && !previewTemplateId && (
                  <p className="text-[11px] text-muted-foreground">
                    Last applied: <span className="font-medium">{form.template}</span> — pick another template above to preview a different one.
                  </p>
                )}
              </div>
            )}

            {formMode === "advanced" && (<>
            <div>
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {customSchema?.kinds.map((k) => (
                    <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="inline-flex items-center gap-1.5">
                Base URL
                <HelpHint>The upstream provider root, e.g. <code className="font-mono">https://api.perplexity.ai</code>. Don't include <code className="font-mono">/v1</code> here unless the provider's chat path is just <code className="font-mono">/chat/completions</code>.</HelpHint>
              </Label>
              <Input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder="https://my-host/v1"
                className="mt-1.5 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                We'll append the chat path automatically (e.g. <code>/chat/completions</code>, <code>/messages</code>, or <code>/responses</code>). Use <em>Path prefix</em> below for things like <code>/v1</code> or <code>/openai/v1</code>.
              </p>
            </div>

            <div>
              <Label>Models URL (optional)</Label>
              <Input
                value={form.models_url}
                onChange={(e) => setForm({ ...form, models_url: e.target.value })}
                placeholder="Leave blank to derive from base URL"
                className="mt-1.5 font-mono text-sm"
              />
            </div>

            {/* Request options — path prefix, explicit paths, response format */}
            <div className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Request options</Label>
                <span className="text-xs text-muted-foreground">
                  Advanced — leave blank for sane defaults
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Path prefix</Label>
                  <Input
                    value={form.path_prefix}
                    onChange={(e) => setForm({ ...form, path_prefix: e.target.value })}
                    placeholder="/v1, /openai/v1"
                    className="mt-1 font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Inserted between base URL and the chat/models path.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Response format</Label>
                  <Select
                    value={form.response_format}
                    onValueChange={(v) => setForm({ ...form, response_format: v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chat_completions">OpenAI Chat Completions</SelectItem>
                      <SelectItem value="responses">OpenAI Responses API</SelectItem>
                      <SelectItem value="anthropic_messages">Anthropic Messages</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    We translate to/from chat-completions automatically.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Chat path override</Label>
                  <Input
                    value={form.chat_path}
                    onChange={(e) => setForm({ ...form, chat_path: e.target.value })}
                    placeholder="/chat/completions"
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Models path override</Label>
                  <Input
                    value={form.models_path}
                    onChange={(e) => setForm({ ...form, models_path: e.target.value })}
                    placeholder="/models"
                    className="mt-1 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="inline-flex items-center gap-1.5">
                  Auth scheme
                  <HelpHint><strong>bearer</strong>: <code className="font-mono">Authorization: Bearer …</code>. <strong>header</strong>: custom header (e.g. <code className="font-mono">x-api-key</code>). <strong>query</strong>: passed as a URL param. <strong>none</strong>: no auth.</HelpHint>
                </Label>
                <Select value={form.auth_scheme} onValueChange={(v) => setForm({ ...form, auth_scheme: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {customSchema?.auth_schemes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.auth_scheme === "header" || form.auth_scheme === "query") && (
                <div>
                  <Label>{form.auth_scheme === "query" ? "Query param name" : "Header name"}</Label>
                  <Input
                    value={form.auth_header}
                    onChange={(e) => setForm({ ...form, auth_header: e.target.value })}
                    placeholder={form.auth_scheme === "query" ? "key" : "api-key"}
                    className="mt-1.5 font-mono text-sm"
                  />
                </div>
              )}
            </div>
            </>)}

            {requiresKey && (
              <div>
                <Label>
                  Provider API key
                  {hasKeyOnRecord && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (leave blank to keep existing)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={form.provider_key}
                  onChange={(e) => setForm({ ...form, provider_key: e.target.value, clear_provider_key: false })}
                  placeholder={hasKeyOnRecord ? "•••••••• (stored, encrypted)" : "your-api-key"}
                  className="mt-1.5 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">Encrypted at rest with AES-GCM.</p>
              </div>
            )}

            {/* Live model listing */}
            <div className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-sm font-medium">Available models</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Hit <code>/models</code> on this endpoint live, then pick the default.
                  </p>
                </div>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={fetchModels}
                  disabled={fetchingModels || !form.base_url}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${fetchingModels ? "animate-spin" : ""}`} />
                  {fetchingModels ? "Fetching…" : "Refresh from upstream"}
                </Button>
              </div>

              {modelsResult && (
                <div className={`text-xs flex items-start gap-2 p-2 rounded-md ${
                  modelsResult.ok ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}>
                  {modelsResult.ok
                    ? <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  <span className="break-all">{modelsResult.msg}</span>
                </div>
              )}

              <div>
                {(() => {
                  const chosen = form.default_model.trim();
                  const dirty = isEdit && chosen !== savedDefaultModel;
                  const inLive = !!liveModels && liveModels.includes(chosen);
                  // Only allow persisting after a successful live refresh in this session.
                  const canPersist = isEdit && lastRefreshOk && !!chosen && dirty && !savingDefault;
                  let hint: { tone: "ok" | "warn" | "muted"; text: string } | null = null;
                  if (isEdit) {
                    if (!lastRefreshOk) {
                      hint = { tone: "muted", text: "Refresh upstream models to enable saving." };
                    } else if (!chosen) {
                      hint = { tone: "muted", text: "Pick a model to enable saving." };
                    } else if (!dirty) {
                      hint = { tone: "ok", text: "Saved." };
                    } else if (!inLive) {
                      hint = { tone: "warn", text: "Not in upstream list — save will be rejected unless forced." };
                    } else {
                      hint = { tone: "ok", text: "Verified against upstream — ready to save." };
                    }
                  }
                  return (
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">Default model</Label>
                      {isEdit && (
                        <div className="flex items-center gap-2">
                          {hint && (
                            <span className={`text-[11px] ${
                              hint.tone === "ok" ? "text-primary"
                                : hint.tone === "warn" ? "text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground"
                            }`}>{hint.text}</span>
                          )}
                          <Button
                            type="button" size="sm" variant="outline"
                            className="h-7 text-xs"
                            disabled={!canPersist}
                            onClick={() => persistDefaultModel(false)}
                            title={
                              !lastRefreshOk
                                ? "Refresh upstream models first"
                                : !dirty
                                  ? "No changes to save"
                                  : "Save default model"
                            }
                          >
                            {savingDefault
                              ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                              : <Save className="h-3.5 w-3.5 mr-1" />}
                            Save as default
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {liveModels && liveModels.length > 0 ? (() => {
                  const q = modelFilter.trim().toLowerCase();
                  const filtered = q
                    ? liveModels.filter((m) => m.toLowerCase().includes(q))
                    : liveModels;
                  return (
                    <div className="space-y-2 mt-1">
                      {liveModels.length > 6 && (
                        <div className="relative">
                          <Input
                            value={modelFilter}
                            onChange={(e) => setModelFilter(e.target.value)}
                            placeholder={`Search ${liveModels.length} models…`}
                            className="font-mono text-xs pr-7"
                          />
                          {modelFilter && (
                            <button
                              type="button"
                              onClick={() => setModelFilter("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              aria-label="Clear search"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Select
                          value={filtered.includes(form.default_model) ? form.default_model : ""}
                          onValueChange={(v) => setForm({ ...form, default_model: v })}
                        >
                          <SelectTrigger className="font-mono text-xs">
                            <SelectValue
                              placeholder={
                                filtered.length === 0
                                  ? "No matches"
                                  : q
                                    ? `Pick from ${filtered.length} of ${liveModels.length}…`
                                    : "Pick from live list…"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {filtered.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                No models match "{modelFilter}"
                              </div>
                            ) : (
                              filtered.map((m) => (
                                <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <Input
                          value={form.default_model}
                          onChange={(e) => setForm({ ...form, default_model: e.target.value })}
                          placeholder="or type manually"
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  );
                })() : (
                  <Input
                    value={form.default_model}
                    onChange={(e) => setForm({ ...form, default_model: e.target.value })}
                    placeholder="e.g. llama3.1 — refresh above to pick from a list"
                    className="mt-1 font-mono text-xs"
                  />
                )}
              </div>

              {formMode === "advanced" && (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Fallback model suggestions</Label>
                  {liveModels && liveModels.length > 0 && (
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setForm({ ...form, model_suggestions: liveModels.join(", ") })}
                    >
                      Use live list as fallback
                    </Button>
                  )}
                </div>
                <Textarea
                  value={form.model_suggestions}
                  onChange={(e) => setForm({ ...form, model_suggestions: e.target.value })}
                  placeholder="llama3.1, qwen2.5, gpt-oss:20b"
                  className="mt-1 font-mono text-xs"
                  rows={2}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Shown if <code>/models</code> can't be reached at request time.
                </p>
              </div>
              )}
            </div>

            {formMode === "advanced" && (
            <div>
              <div className="flex items-center justify-between">
                <Label>Extra headers</Label>
                <Button
                  type="button" size="sm" variant="ghost"
                  onClick={() => setForm({
                    ...form,
                    extra_headers: [...form.extra_headers, { key: "", value: "" }],
                  })}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {form.extra_headers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  e.g. <code>api-version: 2024-10-21</code> for Azure.
                </p>
              )}
              <div className="space-y-2 mt-1.5">
                {form.extra_headers.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={h.key} placeholder="header-name"
                      onChange={(e) => {
                        const next = [...form.extra_headers];
                        next[i] = { ...next[i], key: e.target.value };
                        setForm({ ...form, extra_headers: next });
                      }}
                      className="font-mono text-xs"
                    />
                    <Input
                      value={h.value} placeholder="value"
                      onChange={(e) => {
                        const next = [...form.extra_headers];
                        next[i] = { ...next[i], value: e.target.value };
                        setForm({ ...form, extra_headers: next });
                      }}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button" size="icon" variant="ghost"
                      onClick={() => setForm({
                        ...form,
                        extra_headers: form.extra_headers.filter((_, j) => j !== i),
                      })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            )}

            <div className="space-y-2">
              {/* Validation summary — visible whenever required fields are missing
                  or malformed. Both Test and Save are disabled until cleared. */}
              {!validation.success && errorEntries.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-destructive mb-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Fix {errorEntries.length} field{errorEntries.length === 1 ? "" : "s"} before testing or saving
                  </div>
                  <ul className="ml-5 list-disc space-y-0.5 text-foreground/90">
                    {errorEntries.map(([field, msg]) => (
                      <li key={field}>
                        <span className="font-medium">{FIELD_LABELS[field]}:</span> {msg}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={test}
                  disabled={testing || !canTest}
                  title={!canTest ? "Resolve validation errors above to enable testing" : undefined}
                >
                  <Beaker className="h-4 w-4 mr-2" />
                  {testing ? "Testing…" : "Test connection"}
                </Button>

                <label className="text-xs flex items-center gap-2 text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={probeChat}
                    onChange={(e) => setProbeChat(e.target.checked)}
                  />
                  Also send a tiny chat completion probe
                </label>
              </div>
              {testResult && (
                <div className={`text-xs rounded-md border ${
                  testResult.ok
                    ? "border-primary/30 bg-primary/5 text-foreground"
                    : "border-destructive/40 bg-destructive/5 text-foreground"
                }`}>
                  <div className={`flex items-start gap-2 px-2.5 py-2 ${
                    testResult.ok ? "text-primary" : "text-destructive"
                  }`}>
                    {testResult.ok
                      ? <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      : <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                    <span className="break-all whitespace-pre-wrap">{testResult.msg}</span>
                  </div>
                  {testResult.checks && testResult.checks.length > 0 && (
                    <ul className="border-t border-border/50 px-2.5 py-2 space-y-1">
                      {testResult.checks.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          {c.ok
                            ? <Check className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
                            : <X className="h-3 w-3 shrink-0 mt-0.5 text-destructive" />}
                          <span className="text-foreground/90">
                            <span className="font-medium">{c.name}</span>
                            {c.detail && (
                              <span className="text-muted-foreground"> — <span className="break-all">{c.detail}</span></span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {testResult.chat_probe && (
                    <div className="border-t border-border/50 px-2.5 py-2 text-muted-foreground">
                      Chat probe: {testResult.chat_probe.ok
                        ? <span className="text-primary">OK</span>
                        : <span className="text-destructive">failed</span>}
                      {testResult.chat_probe.model && <> · model <code className="text-foreground">{testResult.chat_probe.model}</code></>}
                      {typeof testResult.chat_probe.latency_ms === "number" && <> · {testResult.chat_probe.latency_ms}ms</>}
                      {testResult.chat_probe.error && (
                        <div className="mt-1 break-all text-destructive">{testResult.chat_probe.error}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Copyable curl examples — generated from the current form state */}
            {formMode === "advanced" && (() => {
              const ex = buildCurlExamples();
              if (!ex) return null;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">curl examples</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {ex.needsKey ? "Set $PROVIDER_KEY in your shell first" : "No auth required"}
                    </span>
                  </div>
                  {ex.needsKey && (
                    <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground">
                      export PROVIDER_KEY='your-key-here'
                    </div>
                  )}
                  {[
                    { label: "List models", cmd: ex.modelsCmd },
                    { label: form.kind === "anthropic" ? "Send a message" : "Chat completion", cmd: ex.chatCmd },
                  ].map((c) => (
                    <div key={c.label} className="rounded-md border bg-muted/20">
                      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/60">
                        <span className="text-xs font-medium">{c.label}</span>
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => copyToClipboard(c.cmd, c.label)}
                        >
                          Copy
                        </Button>
                      </div>
                      <pre className="px-2.5 py-2 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre text-foreground/90">{c.cmd}</pre>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {!isEdit && !createdKey && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={autoCreateKey}
                  onChange={(e) => setAutoCreateKey(e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    Also create an AnveGuard API key for this endpoint
                    {detectedAutoProvider && (
                      <Badge variant="outline" className="text-[10px]">{detectedAutoProvider} detected</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Skip the extra trip to the Keys page — you'll get an <code className="font-mono">ag_live_…</code> key bound to this endpoint and ready to test in the Playground.
                  </p>
                </div>
              </label>
              {autoCreateKey && (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 pl-7">
                  <Input
                    value={autoKeyName}
                    onChange={(e) => setAutoKeyName(e.target.value)}
                    placeholder={`${form.name || "Endpoint"} key`}
                    className="text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap pr-1">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={autoKeyIsAdmin}
                      onChange={(e) => setAutoKeyIsAdmin(e.target.checked)}
                    />
                    Admin key (allow custom system_prompt)
                  </label>
                </div>
              )}
            </div>
          )}

          {createdKey && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Check className="h-4 w-4" />
                Endpoint created and key bound to "{createdKey.endpoint_name}"
              </div>
              <p className="text-xs text-muted-foreground">
                Copy this key now — you won't be able to see it again.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
                <code className="flex-1 truncate">{createdKey.full_key}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey.full_key);
                    toast.success("Key copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    const id = createdKey.id;
                    setOpen(false);
                    navigate(`/dashboard/playground?key=${id}`);
                  }}
                >
                  <Beaker className="h-3.5 w-3.5" />
                  Try in Playground
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {!createdKey && (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
                {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create endpoint"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.key_count ? (
                <>This endpoint is currently used by <strong>{confirmDelete.key_count} API key(s)</strong>.
                You'll need to revoke or migrate them first.</>
              ) : (
                <>The encrypted provider key will also be removed. This can't be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && del.mutate(confirmDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Usage dialog */}
      <Dialog open={!!usageEndpoint} onOpenChange={(o) => !o && setUsageEndpoint(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Usage · {usageEndpoint?.name}
              </DialogTitle>
              {/* Time-range segmented control */}
              <div className="inline-flex items-center rounded-md border bg-muted/30 p-0.5 shrink-0">
                {USAGE_RANGES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setUsageRange(r.value)}
                    aria-pressed={usageRange === r.value}
                    className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
                      usageRange === r.value
                        ? "bg-background text-foreground shadow-sm font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </DialogHeader>

          {usageQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-40" />
            </div>
          ) : !usageRow ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No data yet.</div>
          ) : (
            <div className="space-y-5">
              {/* Stat tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="API keys" value={`${usageRow.stats.active_key_count}/${usageRow.stats.key_count}`} hint="active / total" />
                <StatTile label="Requests" value={usageRow.stats.request_count} />
                <StatTile label="Blocked" value={usageRow.stats.blocked_count} tone={usageRow.stats.blocked_count ? "warn" : undefined} />
                <StatTile label="Avg latency" value={`${usageRow.stats.avg_latency_ms}ms`} />
              </div>
              <p className="text-xs text-muted-foreground">
                Showing data from {USAGE_RANGES.find((r) => r.value === usageRange)?.longLabel ?? "the last 24 hours"}
                {usageRow.stats.last_request_at && (
                  <> · last request {new Date(usageRow.stats.last_request_at).toLocaleString()}</>
                )}
              </p>

              {/* Bound API keys */}
              <div>
                <h3 className="text-sm font-medium mb-2">Bound API keys ({usageRow.keys.length})</h3>
                {usageRow.keys.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 px-3 rounded-md border border-dashed">
                    No API keys are pointing to this endpoint yet.
                  </div>
                ) : (
                  <div className="rounded-md border divide-y">
                    {usageRow.keys.map((k: any) => (
                      <div key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="font-medium truncate">{k.name}</span>
                        <code className="text-xs text-muted-foreground">{k.key_prefix}…</code>
                        {k.is_active ? (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">revoked</Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleString()}` : "never used"}
                        </span>
                        {k.is_active && (() => {
                          // Guard against double submissions: disable the row's
                          // Revoke button while the confirmation dialog is open
                          // OR while a revocation is already in flight (regardless
                          // of which key it targets, so users can't queue a second
                          // revoke before the first resolves).
                          const isTarget = confirmRevokeKey?.id === k.id;
                          const disabled = !!confirmRevokeKey || revokeKeyMutation.isPending;
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={disabled}
                              aria-busy={isTarget && revokeKeyMutation.isPending}
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => {
                                // Derive the most recent model from the windowed
                                // recent_requests list so the confirm dialog can
                                // show context. Falls back to null when this key
                                // hasn't been used inside the active range.
                                const lastReq = (usageRow.recent_requests ?? [])
                                  .find((r: any) => r.api_key_id === k.id);
                                setConfirmRevokeKey({
                                  id: k.id,
                                  name: k.name,
                                  key_prefix: k.key_prefix,
                                  last_used_at: k.last_used_at ?? null,
                                  last_model: lastReq?.model ?? null,
                                });
                              }}
                              title={
                                isTarget && revokeKeyMutation.isPending ? "Revoking…"
                                  : disabled ? "Finish the current action first"
                                  : "Revoke this API key"
                              }
                            >
                              {isTarget && revokeKeyMutation.isPending ? (
                                <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <Ban className="h-3.5 w-3.5 mr-1" />
                              )}
                              {isTarget && revokeKeyMutation.isPending ? "Revoking…" : "Revoke"}
                            </Button>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top models */}
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Top models ({usageRow.top_models?.length ?? 0})
                </h3>
                {!usageRow.top_models || usageRow.top_models.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 px-3 rounded-md border border-dashed">
                    {usageRange === "all"
                      ? "No model activity recorded for this endpoint yet."
                      : `No model activity in ${USAGE_RANGES.find((r) => r.value === usageRange)?.longLabel ?? "the selected window"}.`}
                  </div>
                ) : (
                  <div className="rounded-md border divide-y">
                    {usageRow.top_models.map((m: any, i: number) => {
                      const tokens = (m.tokens_in_total ?? 0) + (m.tokens_out_total ?? 0);
                      return (
                        <div key={`${m.model}-${i}`} className="flex items-center gap-3 px-3 py-2 text-xs">
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-semibold tabular-nums shrink-0">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <code className="text-foreground truncate block">{m.model}</code>
                            {tokens > 0 && (
                              <div className="text-[10px] text-muted-foreground tabular-nums">
                                {(m.tokens_in_total ?? 0).toLocaleString()} in · {(m.tokens_out_total ?? 0).toLocaleString()} out
                              </div>
                            )}
                          </div>
                          {m.blocked_count > 0 && (
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                              {m.blocked_count} blocked
                            </Badge>
                          )}
                          {m.error_count > 0 && (
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                              {m.error_count} err
                            </Badge>
                          )}
                          <span className="ml-auto text-muted-foreground tabular-nums shrink-0 text-right">
                            <span className="text-foreground font-medium">{m.request_count}</span> req · {m.avg_latency_ms}ms
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent requests */}
              <div>
                <h3 className="text-sm font-medium mb-2">Recent requests ({usageRow.recent_requests.length})</h3>
                {usageRow.recent_requests.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 px-3 rounded-md border border-dashed">
                    {usageRange === "all"
                      ? "No requests have been routed through this endpoint yet."
                      : `No requests in ${USAGE_RANGES.find((r) => r.value === usageRange)?.longLabel ?? "the selected window"}.`}
                  </div>
                ) : (
                  <div className="rounded-md border divide-y max-h-80 overflow-y-auto">
                    {usageRow.recent_requests.map((r: any) => {
                      const blocked = typeof r.status === "string" && r.status.startsWith("blocked");
                      const errored = r.status === "error";
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setOpenRequestId(r.id)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-xs text-left hover:bg-muted/60 transition-colors focus:outline-none focus:bg-muted/60"
                          title="Inspect request"
                        >
                          {blocked
                            ? <Ban className="h-3.5 w-3.5 text-destructive shrink-0" />
                            : errored
                              ? <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              : <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                          <span className="text-muted-foreground tabular-nums shrink-0">
                            {new Date(r.created_at).toLocaleTimeString()}
                          </span>
                          <span className="font-medium truncate">{r.api_key_name}</span>
                          <code className="text-muted-foreground truncate">{r.model ?? "—"}</code>
                          <Badge variant="outline" className={`ml-auto text-[10px] ${
                            blocked || errored ? "bg-destructive/10 text-destructive border-destructive/30" : ""
                          }`}>
                            {r.status}
                          </Badge>
                          <span className="text-muted-foreground tabular-nums shrink-0 w-14 text-right">
                            {r.latency_ms ?? 0}ms
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => usageQuery.refetch()} disabled={usageQuery.isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${usageQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={() => setUsageEndpoint(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request drilldown drawer (sits over the usage dialog) */}
      <RequestDetailSheet
        requestId={openRequestId}
        onClose={() => setOpenRequestId(null)}
        query={requestDetailQuery}
      />

      {/* Confirm revocation of a bound API key from the usage dialog */}
      <AlertDialog
        open={!!confirmRevokeKey}
        onOpenChange={(o) => { if (!o && !revokeKeyMutation.isPending) setConfirmRevokeKey(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" />
              Revoke API key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRevokeKey && (
                <>
                  <span className="font-medium text-foreground">"{confirmRevokeKey.name}"</span>{" "}
                  (<code>{confirmRevokeKey.key_prefix}…</code>) will stop working immediately. Any
                  application or service using this key will start receiving 401 errors. This action
                  cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmRevokeKey && (
            <div className="space-y-3">
              {/* Key activity context */}
              <div className="rounded-md border bg-muted/30 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="text-muted-foreground">Last used</div>
                <div className="text-foreground tabular-nums text-right">
                  {confirmRevokeKey.last_used_at
                    ? new Date(confirmRevokeKey.last_used_at).toLocaleString()
                    : <span className="text-muted-foreground italic">never</span>}
                </div>
                <div className="text-muted-foreground">Last model</div>
                <div className="text-foreground text-right truncate">
                  {confirmRevokeKey.last_model
                    ? <code>{confirmRevokeKey.last_model}</code>
                    : <span className="text-muted-foreground italic">
                        no activity in {USAGE_RANGES.find((r) => r.value === usageRange)?.longLabel ?? "the selected window"}
                      </span>}
                </div>
              </div>

              {/* In-flight requests clarification — important for users worried
                  about cancelling a streaming response mid-flight. */}
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground">In-flight requests will continue.</div>
                  <div className="text-muted-foreground">
                    Revocation only blocks <span className="font-medium text-foreground">new</span> requests.
                    Any call that has already passed authentication (including streaming responses
                    in progress) will run to completion. Subsequent requests will be rejected with 401.
                  </div>
                </div>
              </div>
            </div>
          )}

          <AlertDialogFooter className="sm:justify-between gap-2">
            {/* Shortcut: jump straight to the New key flow on /dashboard/keys
                with the suggested name + endpoint binding prefilled via the
                URL. Useful for "lost or compromised key" rotation — user can
                provision the replacement first, then come back and revoke. */}
            <Button
              type="button"
              variant="outline"
              disabled={revokeKeyMutation.isPending}
              onClick={() => {
                if (!confirmRevokeKey) return;
                const params = new URLSearchParams({ new: "1" });
                if (confirmRevokeKey.name) {
                  params.set("name", `${confirmRevokeKey.name} (replacement)`);
                }
                if (usageEndpoint?.id) params.set("endpoint", usageEndpoint.id);
                setConfirmRevokeKey(null);
                navigate(`/dashboard/keys?${params.toString()}`);
              }}
              className="sm:mr-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create replacement key
            </Button>
            <div className="flex gap-2">
              <AlertDialogCancel disabled={revokeKeyMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={revokeKeyMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmRevokeKey) revokeKeyMutation.mutate(confirmRevokeKey.id);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {revokeKeyMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Revoking…</>
                ) : (
                  <><Ban className="h-4 w-4 mr-2" />Revoke key</>
                )}
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import preview dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportPayload(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Import endpoints
            </DialogTitle>
          </DialogHeader>

          {importPayload && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Endpoints in file</span>
                  <span className="font-medium">{importPayload.endpoints?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Format</span>
                  <code className="text-xs">{importPayload.format ?? "—"} v{importPayload.version ?? 1}</code>
                </div>
                {importPayload.exported_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exported</span>
                    <span className="text-xs">{new Date(importPayload.exported_at).toLocaleString()}</span>
                  </div>
                )}
                {importPayload.endpoints?.some((e: any) => e.provider_key_encrypted) && (
                  <div className="flex items-start gap-2 mt-2 text-xs text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>This file contains encrypted provider keys. They will only restore on this same project.</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>On name conflict</Label>
                <Select value={importStrategy} onValueChange={(v: any) => setImportStrategy(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rename">Import as new (append "(imported)")</SelectItem>
                    <SelectItem value="skip">Skip existing endpoints</SelectItem>
                    <SelectItem value="overwrite">Overwrite existing endpoints</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {importPayload.endpoints?.some((e: any) => e.provider_key_encrypted) && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 mt-0.5 accent-primary"
                    checked={acceptKeys}
                    onChange={(e) => setAcceptKeys(e.target.checked)}
                  />
                  <span>Restore encrypted provider keys from this file (only works on the project that exported them).</span>
                </label>
              )}

              <div className="rounded-md border p-2 max-h-40 overflow-y-auto space-y-1">
                {(importPayload.endpoints ?? []).slice(0, 30).map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Plug className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{e.name || "(unnamed)"}</span>
                    <code className="text-muted-foreground truncate">{e.base_url}</code>
                    {e.provider_key_encrypted && <KeyRound className="h-3 w-3 text-primary ml-auto shrink-0" />}
                  </div>
                ))}
                {(importPayload.endpoints?.length ?? 0) > 30 && (
                  <div className="text-[11px] text-muted-foreground pt-1">
                    + {importPayload.endpoints.length - 30} more…
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setImportOpen(false); setImportPayload(null); }}>Cancel</Button>
            <Button onClick={runImport} disabled={importing || !importPayload}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function StatTile({
  label, value, hint, tone,
}: { label: string; value: ReactNode; hint?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-md border p-3 ${tone === "warn" ? "border-destructive/30 bg-destructive/5" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

// -------- Request drilldown sheet ------------------------------------------
// Renders the full prompt + response payload for a single request_log row.
// Loaded lazily via the `endpoint_request_detail` action so we don't bloat
// the usage dialog's initial response with potentially large jsonb blobs.
function RequestDetailSheet({
  requestId, onClose, query,
}: {
  requestId: string | null;
  onClose: () => void;
  query: ReturnType<typeof useQuery<{ request: any }, Error>>;
}) {
  const open = !!requestId;
  const req = query.data?.request;

  const blocked = typeof req?.status === "string" && req.status.startsWith("blocked");
  const errored = req?.status === "error";

  const assistantText = useMemo(() => extractAssistantText(req?.response), [req?.response]);
  const promptMessages = Array.isArray(req?.messages) ? req.messages : null;

  const copyJson = (obj: unknown, label: string) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            {blocked
              ? <Ban className="h-4 w-4 text-destructive" />
              : errored
                ? <AlertCircle className="h-4 w-4 text-destructive" />
                : <Check className="h-4 w-4 text-primary" />}
            Request inspector
          </SheetTitle>
          <SheetDescription>
            {req
              ? `${new Date(req.created_at).toLocaleString()} · ${req.model ?? "—"} · ${req.provider ?? "—"}`
              : "Loading request details…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          {query.isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : query.isError ? (
            <div className="p-6 text-sm text-destructive">
              {(query.error as Error)?.message ?? "Failed to load request"}
            </div>
          ) : !req ? (
            <div className="p-6 text-sm text-muted-foreground">No request selected.</div>
          ) : (
            <ScrollArea className="h-full">
              <div className="px-6 py-4 space-y-4">
                {/* Header strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <MetaTile label="Status" value={
                    <Badge variant="outline" className={
                      blocked || errored
                        ? "bg-destructive/10 text-destructive border-destructive/30"
                        : ""
                    }>{req.status}</Badge>
                  } />
                  <MetaTile label="Latency" value={`${req.latency_ms ?? 0} ms`} />
                  <MetaTile label="Tokens in" value={req.tokens_in ?? "—"} />
                  <MetaTile label="Tokens out" value={req.tokens_out ?? "—"} />
                </div>

                <div className="text-xs text-muted-foreground space-y-0.5">
                  {req.api_key_name && (
                    <div>API key: <span className="text-foreground font-medium">{req.api_key_name}</span>
                      {req.api_key_prefix && <code className="ml-2">{req.api_key_prefix}…</code>}
                    </div>
                  )}
                  <div>Request ID: <code>{req.id}</code></div>
                </div>

                {/* Block reason */}
                {blocked && req.block_reason && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-destructive mb-1">
                      <Ban className="h-3.5 w-3.5" /> Blocked by policy
                    </div>
                    <div className="text-xs text-foreground whitespace-pre-wrap">{req.block_reason}</div>
                  </div>
                )}

                <Tabs defaultValue="prompt" className="w-full">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="prompt">Prompt</TabsTrigger>
                    <TabsTrigger value="response">Response</TabsTrigger>
                    <TabsTrigger value="raw">Raw</TabsTrigger>
                  </TabsList>

                  <TabsContent value="prompt" className="mt-3">
                    {promptMessages ? (
                      <div className="space-y-2">
                        {promptMessages.map((m: any, i: number) => (
                          <div key={i} className="rounded-md border bg-muted/30 p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {m.role ?? "message"}
                              </Badge>
                            </div>
                            <pre className="text-xs whitespace-pre-wrap break-words font-mono text-foreground">
                              {typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : req.messages ? (
                      <JsonBlock value={req.messages} onCopy={() => copyJson(req.messages, "Prompt")} />
                    ) : (
                      <EmptyHint>No prompt payload was recorded for this request.</EmptyHint>
                    )}
                  </TabsContent>

                  <TabsContent value="response" className="mt-3 space-y-3">
                    {assistantText && (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          Assistant message
                        </div>
                        <pre className="text-xs whitespace-pre-wrap break-words font-mono text-foreground">
                          {assistantText}
                        </pre>
                      </div>
                    )}
                    {req.response ? (
                      <JsonBlock value={req.response} onCopy={() => copyJson(req.response, "Response")} />
                    ) : (
                      <EmptyHint>
                        No response payload was recorded
                        {blocked ? " (request was blocked before reaching the provider)." : "."}
                      </EmptyHint>
                    )}
                  </TabsContent>

                  <TabsContent value="raw" className="mt-3">
                    <JsonBlock value={req} onCopy={() => copyJson(req, "Raw row")} />
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MetaTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground py-3 px-3 rounded-md border border-dashed">
      {children}
    </div>
  );
}

function JsonBlock({ value, onCopy }: { value: unknown; onCopy: () => void }) {
  return (
    <div className="relative rounded-md border bg-muted/30">
      <Button
        variant="ghost"
        size="sm"
        onClick={onCopy}
        className="absolute top-1 right-1 h-7 px-2 text-xs"
      >
        <Copy className="h-3 w-3 mr-1" /> Copy
      </Button>
      <pre className="text-xs font-mono p-3 pr-16 overflow-x-auto whitespace-pre-wrap break-words max-h-[420px]">
        {safeStringify(value)}
      </pre>
    </div>
  );
}

function safeStringify(v: unknown) {
  try { return JSON.stringify(v, null, 2); }
  catch { return String(v); }
}

// Extract a human-readable assistant message from common provider response
// shapes: OpenAI chat_completions, OpenAI Responses API, Anthropic messages.
function extractAssistantText(resp: any): string | null {
  if (!resp || typeof resp !== "object") return null;
  // chat_completions
  const choice = resp.choices?.[0];
  if (choice) {
    const c = choice.message?.content ?? choice.delta?.content ?? choice.text;
    if (typeof c === "string" && c.trim()) return c;
    if (Array.isArray(c)) {
      const joined = c.map((p: any) => p?.text ?? p?.content ?? "").filter(Boolean).join("\n");
      if (joined.trim()) return joined;
    }
  }
  // Responses API
  if (typeof resp.output_text === "string" && resp.output_text.trim()) return resp.output_text;
  const out = resp.output?.[0];
  if (out) {
    const part = out.content?.[0];
    if (typeof part?.text === "string" && part.text.trim()) return part.text;
  }
  // Anthropic messages
  if (Array.isArray(resp.content)) {
    const joined = resp.content
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("\n");
    if (joined.trim()) return joined;
  }
  return null;
}

export default Endpoints;
