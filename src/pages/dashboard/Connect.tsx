import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Plug,
  Plus,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Coins,
  TrendingUp,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

// =====================================================================
// Provider catalog — what the wizard surfaces.
// `endpointTemplate` defines how we materialize this provider as an
// `endpoints` row when the user attaches it as an *additional* LLM under
// an existing AnveGuard key. For first-class providers (openai, anthropic,
// etc.) `create_key` already knows the upstream, so we only need the
// endpoint shape when wiring extra providers via model aliases.
// =====================================================================
type EndpointTemplate = {
  base_url: string;
  kind: string;                     // "openai_compatible" | "anthropic_messages"
  auth_scheme: "bearer" | "header" | "none";
  auth_header?: string;
  response_format?: "chat_completions" | "anthropic_messages" | "responses";
  path_prefix?: string;
  chat_path?: string;
  models_path?: string;
};

type Tile = {
  id: string;
  provider: string;                 // value sent as `provider` to create_key
  template?: string;                // custom_schema template id (gemini/groq/etc)
  label: string;
  blurb: string;
  keyHint: string;
  getKeyUrl: string;
  needsKey: boolean;
  defaultModel?: string;
  badge?: string;
  modelSuggestions?: string[];      // for alias auto-suggestion
  endpointTemplate?: EndpointTemplate; // for "add as extra provider" path
};

const TILES: Tile[] = [
  {
    id: "perplexity",
    provider: "perplexity",
    label: "Perplexity",
    blurb: "Sonar models with built-in web search grounding.",
    keyHint: "pplx-...",
    getKeyUrl: "https://www.perplexity.ai/settings/api",
    needsKey: true,
    defaultModel: "sonar",
    badge: "Default",
    modelSuggestions: ["sonar", "sonar-pro", "sonar-reasoning"],
    endpointTemplate: {
      base_url: "https://api.perplexity.ai",
      kind: "openai_compatible",
      auth_scheme: "bearer",
      auth_header: "Authorization",
      response_format: "chat_completions",
      chat_path: "/chat/completions",
      models_path: "/models",
    },
  },
  {
    id: "openai",
...
      models_path: "/models",
    },
  },
  {
    id: "gemini",
    provider: "custom",
    template: "gemini",
    label: "Google Gemini",
    blurb: "AI Studio's OpenAI-compatible endpoint.",
    keyHint: "Your Google AI Studio key",
    getKeyUrl: "https://aistudio.google.com/apikey",
    needsKey: true,
    defaultModel: "gemini-2.5-flash",
    modelSuggestions: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview"],
  },
  {
    id: "groq",
    provider: "custom",
    template: "groq",
    label: "Groq",
    blurb: "Llama, Mixtral, Whisper — fastest tokens/sec.",
    keyHint: "gsk_...",
    getKeyUrl: "https://console.groq.com/keys",
    needsKey: true,
    defaultModel: "llama-3.3-70b-versatile",
    modelSuggestions: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  },
  {
    id: "mistral",
    provider: "custom",
    template: "mistral",
    label: "Mistral",
    blurb: "Mistral Large, Codestral, Ministral.",
    keyHint: "Your Mistral key",
    getKeyUrl: "https://console.mistral.ai/api-keys/",
    needsKey: true,
    defaultModel: "mistral-large-latest",
    modelSuggestions: ["mistral-large-latest", "codestral-latest", "ministral-8b-latest"],
  },
  {
    id: "kimi",
    provider: "kimi",
    label: "Moonshot Kimi",
    blurb: "Kimi K2 turbo + long-context Moonshot models.",
    keyHint: "sk-...",
    getKeyUrl: "https://platform.moonshot.ai/console/api-keys",
    needsKey: true,
    defaultModel: "kimi-k2-turbo-preview",
    modelSuggestions: ["kimi-k2-turbo-preview", "moonshot-v1-128k"],
    endpointTemplate: {
      base_url: "https://api.moonshot.ai",
      kind: "openai_compatible",
      auth_scheme: "bearer",
      auth_header: "Authorization",
      response_format: "chat_completions",
      path_prefix: "/v1",
      chat_path: "/chat/completions",
      models_path: "/models",
    },
  },
  {
    id: "ollama",
    provider: "custom",
    template: "ollama",
    label: "Ollama",
    blurb: "Local llama.cpp / Ollama. No auth required.",
    keyHint: "",
    getKeyUrl: "https://ollama.com/download",
    needsKey: false,
    defaultModel: "llama3.1",
    modelSuggestions: ["llama3.1", "qwen2.5", "mistral"],
    badge: "Local",
  },
  {
    id: "lovable",
    provider: "lovable",
    label: "Lovable AI",
    blurb: "Managed gateway. No upstream key needed.",
    keyHint: "",
    getKeyUrl: "https://docs.lovable.dev/features/ai",
    needsKey: false,
    defaultModel: "google/gemini-3-flash-preview",
    modelSuggestions: ["google/gemini-3-flash-preview", "google/gemini-2.5-pro", "openai/gpt-5-mini"],
    badge: "Managed",
  },
  {
    id: "custom",
    provider: "custom",
    label: "Custom OpenAI-compatible",
    blurb: "Any /v1/chat/completions endpoint — vLLM, Together, anything.",
    keyHint: "Your provider key (optional)",
    getKeyUrl: "https://platform.openai.com/docs/api-reference/chat",
    needsKey: true,
    badge: "Advanced",
  },
];

interface ProviderListResp {
  providers: { id: string; label: string; default_model: string; model_suggestions: string[] }[];
  custom_schema: {
    templates: {
      id: string;
      values: {
        kind: string;
        base_url: string;
        auth_scheme: string;
        auth_header?: string;
        default_model: string;
        model_suggestions: string;
        path_prefix?: string;
        chat_path?: string;
        models_path?: string;
        response_format?: string;
      };
    }[];
  };
}

interface AliasRow {
  id: string;
  alias: string;
  target_model: string;
  target_endpoint_id: string | null;
}

interface EndpointRow {
  id: string;
  name: string;
  base_url: string;
  kind: string;
  default_model: string | null;
}

interface KeyRow {
  id: string;
  name: string;
  provider: string;
  endpoint_id: string | null;
  model_default: string;
  key_prefix: string;
  custom_base_url?: string | null;
  spend_limit_usd?: number | null;
  current_spend_usd?: number;
  token_limit?: number | null;
  current_token_spend?: number;
  limit_window?: "infinite" | "daily" | "monthly";
  limit_reset_at?: string | null;
}

type Step = 0 | 1 | 2 | 3;

const Connect = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editKeyId = searchParams.get("key");

  const { data: providerData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => call<ProviderListResp>("list_providers"),
  });

  // ---- Wizard state ------------------------------------------------------
  const [step, setStep] = useState<Step>(0);
  const [tile, setTile] = useState<Tile | null>(null);
  const [providerKey, setProviderKey] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [spendLimitUsd, setSpendLimitUsd] = useState("");
  const [tokenLimit, setTokenLimit] = useState("");
  const [limitWindow, setLimitWindow] = useState<"infinite" | "daily" | "monthly">("infinite");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [created, setCreated] = useState<{ fullKey: string; id: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [revealKey, setRevealKey] = useState(true);

  // ---- Multi-provider state (step 2) ------------------------------------
  // Workspace = one api_keys row + N endpoints attached via model_aliases.
  // We track providers + their aliases locally so the UI can render them
  // immediately after save (queries refetch in the background).
  const [extraDrawerTile, setExtraDrawerTile] = useState<Tile | null>(null);
  const [extraProviderKey, setExtraProviderKey] = useState("");
  const [extraCustomBaseUrl, setExtraCustomBaseUrl] = useState("");
  const [extraAlias, setExtraAlias] = useState("");
  const [extraSaving, setExtraSaving] = useState(false);

  // ---- Edit mode: hydrate from ?key=<id> --------------------------------
  // When the user lands on /dashboard/connect?key=<id> from the Keys page,
  // we skip steps 0–1 and jump straight to step 2 with the existing
  // workspace loaded.
  const { data: existingKeys } = useQuery({
    queryKey: ["keys"],
    queryFn: () => call<{ keys: KeyRow[] }>("list_keys"),
    enabled: !!editKeyId,
  });

  useEffect(() => {
    if (!editKeyId || !existingKeys) return;
    const k = existingKeys.keys.find((row) => row.id === editKeyId);
    if (!k) return;
    setCreated({ fullKey: "", id: k.id });
    setName(k.name);
    setModel(k.model_default);
    // Best-effort: surface the original tile so the "primary provider"
    // card renders the right label/blurb. Falls back to the Custom tile
    // for anything we don't recognize.
    const matched =
      TILES.find((t) => t.provider === k.provider && (t.id === k.provider || (k.custom_base_url && t.endpointTemplate?.base_url && k.custom_base_url.startsWith(t.endpointTemplate.base_url)))) ||
      TILES.find((t) => t.provider === k.provider) ||
      TILES.find((t) => t.id === "custom")!;
    setTile(matched);
    if (k.custom_base_url) setCustomBaseUrl(k.custom_base_url);
    setStep(2);
  }, [editKeyId, existingKeys]);

  // ---- Update existing key (edit mode) ----------------------------------
  const updateKey = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      call<{ ok: boolean }>("update_key", { body: { id: created?.id, ...patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      toast.success("Connector updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Editable fields in edit mode (kept separate from creation state so
  // unsaved edits don't bleed into the create flow if the user navigates).
  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editSpendLimitUsd, setEditSpendLimitUsd] = useState("");
  const [editTokenLimit, setEditTokenLimit] = useState("");
  const [editLimitWindow, setEditLimitWindow] = useState<"infinite" | "daily" | "monthly">("infinite");
  const [changeProviderOpen, setChangeProviderOpen] = useState(false);
  const [swapTile, setSwapTile] = useState<Tile | null>(null);
  const [swapKey, setSwapKey] = useState("");
  const [swapBaseUrl, setSwapBaseUrl] = useState("");
  const [attachExistingOpen, setAttachExistingOpen] = useState(false);
  const [attachEndpointId, setAttachEndpointId] = useState("");
  const [attachAlias, setAttachAlias] = useState("");

  useEffect(() => {
    if (editKeyId) {
      setEditName(name);
      setEditModel(model);
      const k = existingKeys?.keys.find((row) => row.id === editKeyId);
      if (k) {
        setEditSpendLimitUsd(k.spend_limit_usd != null ? String(k.spend_limit_usd) : "");
        setEditTokenLimit(k.token_limit != null ? String(k.token_limit) : "");
        setEditLimitWindow(k.limit_window || "infinite");
      }
    }
  }, [editKeyId, name, model, existingKeys]);


  // Aliases + endpoints attached to the current AnveGuard key. Refetched
  // after every add/remove so the list is always live.
  const aliasesQuery = useQuery({
    queryKey: ["aliases", created?.id],
    queryFn: () => call<{ aliases: AliasRow[] }>("list_aliases", { body: { api_key_id: created!.id } }),
    enabled: !!created?.id,
  });

  const endpointsQuery = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<{ endpoints: EndpointRow[] }>("list_endpoints"),
    enabled: !!created?.id,
  });

  const endpointById = useMemo(() => {
    const m: Record<string, EndpointRow> = {};
    for (const e of endpointsQuery.data?.endpoints ?? []) m[e.id] = e;
    return m;
  }, [endpointsQuery.data]);

  const template = useMemo(() => {
    if (!tile?.template) return null;
    return providerData?.custom_schema.templates.find((t) => t.id === tile.template) ?? null;
  }, [tile, providerData]);

  const customPayload = useMemo(() => {
    if (!tile || tile.provider !== "custom") return undefined;
    if (tile.id === "custom") {
      return {
        base_url: customBaseUrl.trim(),
        kind: "openai_compatible",
        auth_scheme: providerKey ? "bearer" : "none",
        auth_header: "Authorization",
        extra_headers: {},
        model_suggestions: [],
      };
    }
    if (!template) return undefined;
    const v = template.values;
    return {
      base_url: v.base_url,
      kind: v.kind,
      auth_scheme: v.auth_scheme,
      auth_header: v.auth_header || "Authorization",
      extra_headers: {},
      path_prefix: v.path_prefix,
      chat_path: v.chat_path,
      models_path: v.models_path,
      response_format: v.response_format,
      model_suggestions: (v.model_suggestions || "").split(",").map((s) => s.trim()).filter(Boolean),
    };
  }, [tile, template, customBaseUrl, providerKey]);

  // ---- Step actions ------------------------------------------------------

  const pickTile = (t: Tile) => {
    setTile(t);
    setProviderKey("");
    setModel(t.defaultModel ?? "");
    setName(`${t.label} workspace`);
    setCustomBaseUrl("");
    setTestResult(null);
    setStep(1);
  };

  const back = () => {
    setStep((s) => (s === 0 ? 0 : ((s - 1) as Step)));
    setTestResult(null);
  };

  const canTest = useMemo(() => {
    if (!tile) return false;
    if (tile.id === "custom" && !customBaseUrl.trim()) return false;
    if (tile.needsKey && !providerKey.trim()) return false;
    return true;
  }, [tile, providerKey, customBaseUrl]);

  const runTest = async () => {
    if (!tile) return;
    setTesting(true);
    setTestResult(null);
    try {
      if (tile.provider === "custom") {
        const r = await call<{ ok: boolean; status?: number; error?: string; sample_model?: string }>(
          "test_custom_endpoint",
          { body: { ...customPayload, provider_key: providerKey || undefined } },
        );
        setTestResult(
          r.ok
            ? { ok: true, msg: r.sample_model ? `Connected · ${r.sample_model}` : `Connected (${r.status})` }
            : { ok: false, msg: r.error || `HTTP ${r.status}` },
        );
      } else {
        setTestResult({ ok: true, msg: tile.needsKey ? "Key format looks valid" : "Ready" });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  // `nextStep` lets Step 1's two CTAs decide where to land after creation:
  //   2 → "Add more LLMs" (N:1 unified gateway)
  //   3 → straight to credentials (1:1 simple drop-in)
  const createKey = useMutation({
    mutationFn: (_opts: { nextStep: 2 | 3 }) =>
      call<{ id: string; full_key: string }>("create_key", {
        body: {
          name: name.trim() || `${tile?.label} workspace`,
          provider: tile?.provider,
          model: model || tile?.defaultModel,
          provider_key: tile?.needsKey ? providerKey : undefined,
          custom: tile?.provider === "custom" ? customPayload : undefined,
          spend_limit_usd: spendLimitUsd ? parseFloat(spendLimitUsd) : undefined,
          token_limit: tokenLimit ? parseInt(tokenLimit, 10) : undefined,
          limit_window: limitWindow,
        },
      }),
    onSuccess: (res, vars) => {
      setCreated({ fullKey: res.full_key, id: res.id });
      setStep(vars.nextStep);
      qc.invalidateQueries({ queryKey: ["keys"] });
      toast.success(
        vars.nextStep === 2
          ? "AnveGuard key created — attach more LLMs."
          : "AnveGuard key created — copy your credentials.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Step 2: add another provider as endpoint + alias -----------------

  const openExtraDrawer = (t: Tile) => {
    setExtraDrawerTile(t);
    setExtraProviderKey("");
    setExtraCustomBaseUrl("");
    setExtraAlias(t.defaultModel ?? "");
  };
  const closeExtraDrawer = () => {
    setExtraDrawerTile(null);
    setExtraProviderKey("");
    setExtraCustomBaseUrl("");
    setExtraAlias("");
  };

  // Build the endpoint payload for the *additional* provider drawer. Uses
  // first-class tiles' bundled endpointTemplate when present, otherwise
  // falls back to the custom-schema template (gemini/groq/mistral/ollama),
  // otherwise the bare custom shape.
  const extraEndpointPayload = (): Record<string, unknown> | null => {
    if (!extraDrawerTile) return null;
    const t = extraDrawerTile;
    if (t.endpointTemplate) {
      return {
        name: `${t.label}`,
        ...t.endpointTemplate,
        default_model: extraAlias || t.defaultModel,
        model_suggestions: t.modelSuggestions ?? [],
        provider_key: t.needsKey ? extraProviderKey : undefined,
      };
    }
    if (t.template) {
      const tpl = providerData?.custom_schema.templates.find((x) => x.id === t.template);
      if (!tpl) return null;
      const v = tpl.values;
      return {
        name: `${t.label}`,
        base_url: v.base_url,
        kind: v.kind,
        auth_scheme: v.auth_scheme,
        auth_header: v.auth_header || "Authorization",
        path_prefix: v.path_prefix,
        chat_path: v.chat_path,
        models_path: v.models_path,
        response_format: v.response_format,
        default_model: extraAlias || t.defaultModel,
        model_suggestions: (v.model_suggestions || "").split(",").map((s) => s.trim()).filter(Boolean),
        provider_key: t.needsKey ? extraProviderKey : undefined,
      };
    }
    if (t.id === "custom") {
      return {
        name: `Custom — ${new URL(extraCustomBaseUrl || "https://example.com").host}`,
        base_url: extraCustomBaseUrl.trim(),
        kind: "openai_compatible",
        auth_scheme: extraProviderKey ? "bearer" : "none",
        auth_header: "Authorization",
        default_model: extraAlias,
        model_suggestions: [],
        provider_key: extraProviderKey || undefined,
      };
    }
    return null;
  };

  const saveExtraProvider = async () => {
    if (!extraDrawerTile || !created) return;
    if (extraDrawerTile.needsKey && !extraProviderKey.trim()) {
      toast.error("API key required");
      return;
    }
    if (extraDrawerTile.id === "custom" && !extraCustomBaseUrl.trim()) {
      toast.error("Base URL required");
      return;
    }
    if (!extraAlias.trim()) {
      toast.error("Model name required");
      return;
    }
    setExtraSaving(true);
    try {
      const payload = extraEndpointPayload();
      if (!payload) throw new Error("Could not build endpoint config");
      // 1. Create the endpoint row.
      const ep = await call<{ id: string }>("save_endpoint", { body: payload });
      // 2. Wire an alias on the AnveGuard key → that endpoint.
      await call("save_alias", {
        body: {
          api_key_id: created.id,
          alias: extraAlias.trim().toLowerCase(),
          target_model: extraAlias.trim(),
          target_endpoint_id: ep.id,
        },
      });
      toast.success(`${extraDrawerTile.label} attached as "${extraAlias}"`);
      closeExtraDrawer();
      qc.invalidateQueries({ queryKey: ["aliases", created.id] });
      qc.invalidateQueries({ queryKey: ["endpoints"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExtraSaving(false);
    }
  };

  const removeAlias = useMutation({
    mutationFn: (id: string) => call("delete_alias", { body: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aliases", created?.id] });
      toast.success("Model removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Edit mode: swap primary provider --------------------------------
  const aliasedEndpointIds = useMemo(
    () => new Set((aliasesQuery.data?.aliases ?? []).map((a) => a.target_endpoint_id).filter(Boolean) as string[]),
    [aliasesQuery.data],
  );
  const unattachedEndpoints = useMemo(
    () => (endpointsQuery.data?.endpoints ?? []).filter((e) => !aliasedEndpointIds.has(e.id)),
    [endpointsQuery.data, aliasedEndpointIds],
  );

  const openChangeProvider = () => {
    setSwapTile(null);
    setSwapKey("");
    setSwapBaseUrl("");
    setChangeProviderOpen(true);
  };

  const confirmSwap = async () => {
    if (!swapTile || !created) return;
    if (swapTile.needsKey && !swapKey.trim()) {
      toast.error("API key required");
      return;
    }
    if (swapTile.id === "custom" && !swapBaseUrl.trim()) {
      toast.error("Base URL required");
      return;
    }
    let customPayloadSwap: Record<string, unknown> | undefined;
    if (swapTile.provider === "custom") {
      if (swapTile.id === "custom") {
        customPayloadSwap = {
          base_url: swapBaseUrl.trim(),
          kind: "openai_compatible",
          auth_scheme: swapKey ? "bearer" : "none",
          auth_header: "Authorization",
          extra_headers: {},
          model_suggestions: [],
        };
      } else if (swapTile.template) {
        const tpl = providerData?.custom_schema.templates.find((t) => t.id === swapTile.template);
        if (tpl) {
          const v = tpl.values;
          customPayloadSwap = {
            base_url: v.base_url,
            kind: v.kind,
            auth_scheme: v.auth_scheme,
            auth_header: v.auth_header || "Authorization",
            extra_headers: {},
            path_prefix: v.path_prefix,
            chat_path: v.chat_path,
            models_path: v.models_path,
            response_format: v.response_format,
            model_suggestions: (v.model_suggestions || "").split(",").map((s) => s.trim()).filter(Boolean),
          };
        }
      }
    }
    try {
      await call("update_key", {
        body: {
          id: created.id,
          provider: swapTile.provider,
          provider_key: swapTile.needsKey ? swapKey : undefined,
          custom: customPayloadSwap,
          model_default: swapTile.defaultModel || undefined,
        },
      });
      toast.success(`Primary provider switched to ${swapTile.label}`);
      setTile(swapTile);
      if (swapTile.defaultModel) {
        setModel(swapTile.defaultModel);
        setEditModel(swapTile.defaultModel);
      }
      setChangeProviderOpen(false);
      qc.invalidateQueries({ queryKey: ["keys"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Edit mode: attach an already-saved endpoint as an alias --------
  const submitAttachExisting = async () => {
    if (!created || !attachEndpointId) return;
    const ep = endpointById[attachEndpointId];
    if (!ep) return;
    const aliasName = (attachAlias.trim() || ep.default_model || ep.name).toLowerCase();
    try {
      await call("save_alias", {
        body: {
          api_key_id: created.id,
          alias: aliasName,
          target_model: attachAlias.trim() || ep.default_model || ep.name,
          target_endpoint_id: ep.id,
        },
      });
      toast.success(`${ep.name} attached as "${aliasName}"`);
      setAttachExistingOpen(false);
      setAttachEndpointId("");
      setAttachAlias("");
      qc.invalidateQueries({ queryKey: ["aliases", created.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };


  const copy = (s: string, label: string) => {
    navigator.clipboard.writeText(s);
    toast.success(`${label} copied`);
  };

  // Sends a 1-token completion through the proxy with the freshly-minted key.
  const sendTestRequest = async () => {
    if (!created?.fullKey) return;
    setSendingTest(true);
    try {
      const res = await fetch(`${PROXY_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${created.fullKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || tile?.defaultModel,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          max_tokens: 4,
        }),
      });
      await res.json().catch(() => null);
      if (res.ok) {
        toast.success("Test request sent — check Logs");
        setTimeout(() => navigate("/dashboard/logs"), 600);
      } else {
        toast.error(`Proxy returned ${res.status} — see Logs for details`);
        setTimeout(() => navigate("/dashboard/logs"), 600);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingTest(false);
    }
  };

  // Models the user can route to: primary model + every alias.
  const routableModels = useMemo<{ model: string; via: string }[]>(() => {
    const out: { model: string; via: string }[] = [];
    if (model || tile?.defaultModel) {
      out.push({ model: model || tile!.defaultModel!, via: tile?.label ?? "primary" });
    }
    for (const a of aliasesQuery.data?.aliases ?? []) {
      const epName = a.target_endpoint_id ? endpointById[a.target_endpoint_id]?.name : null;
      out.push({ model: a.alias, via: epName ?? "primary" });
    }
    return out;
  }, [model, tile, aliasesQuery.data, endpointById]);

  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-meta uppercase tracking-[0.18em] text-primary font-mono">
          <Sparkles className="h-3 w-3" /> Connect
        </div>
        <h1 className="text-display font-semibold tracking-tight">
          {editKeyId ? "Manage workspace." : "One key. Many LLMs."}
        </h1>
        <p className="text-body text-muted-foreground max-w-2xl">
          Connect OpenAI, Anthropic, OpenRouter, Perplexity, Ollama — as many
          as you want — under a single AnveGuard key. Pick the model per
          request and every call still runs through your policies and shows up
          in Logs.
        </p>
      </header>

      {/* Stepper -------------------------------------------------------- */}
      <ol className="flex items-center gap-2 text-meta font-mono flex-wrap">
        {[
          { n: 1, label: "Primary provider" },
          { n: 2, label: "Paste key" },
          { n: 3, label: "Add more LLMs" },
          { n: 4, label: "Get credentials" },
        ].map((s, i) => {
          const active = step === i;
          const done = step > i;
          return (
            <li key={s.n} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full border tabular-nums",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && !done && "border-primary text-primary",
                  !active && !done && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : s.n}
              </span>
              <span
                className={cn(
                  "uppercase tracking-[0.14em]",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < 3 && <span className="mx-2 h-px w-8 bg-border" />}
            </li>
          );
        })}
      </ol>

      {/* Step 0 — pick primary provider --------------------------------- */}
      {step === 0 && (
        <>
        <p className="text-meta text-muted-foreground -mt-2">
          Pick a primary provider. Next, either finish 1:1 (one provider, one
          key) or attach more LLMs to the same key for a unified gateway.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TILES.map((t) => (
            <button
              key={t.id}
              onClick={() => pickTile(t)}
              className="text-left rounded-md border border-border surface-1 p-4 hover:border-primary/60 hover:surface-2 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="font-medium">{t.label}</span>
                </div>
                {t.badge && (
                  <Badge variant="outline" className="text-meta font-mono">
                    {t.badge}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-body text-muted-foreground leading-snug">{t.blurb}</p>
              {t.defaultModel && (
                <div className="mt-3 text-meta font-mono text-muted-foreground truncate">
                  default · {t.defaultModel}
                </div>
              )}
            </button>
          ))}
        </div>
        </>
      )}

      {/* Step 1 — paste key + create workspace -------------------------- */}
      {step === 1 && tile && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-primary" /> {tile.label}
              </CardTitle>
              <a
                href={tile.getKeyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-meta text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Get a key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Workspace name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${tile.label} workspace`}
                maxLength={120}
              />
              <p className="text-meta text-muted-foreground">
                Internal label for this AnveGuard key — e.g. "Production", "Staging".
              </p>
            </div>

            {tile.id === "custom" && (
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="https://your-host.example.com"
                />
              </div>
            )}

            {tile.needsKey ? (
              <div className="space-y-2">
                <Label>{tile.label} API key</Label>
                <Input
                  type="password"
                  value={providerKey}
                  onChange={(e) => setProviderKey(e.target.value)}
                  placeholder={tile.keyHint || "Paste your key"}
                  autoComplete="off"
                />
                <p className="text-meta text-muted-foreground">
                  Stored AES-GCM encrypted. Never returned over the API after this step.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-border surface-2 px-3 py-2 text-meta text-muted-foreground">
                {tile.id === "lovable"
                  ? "No upstream key needed — Lovable AI is managed."
                  : "No upstream key needed for local Ollama. The proxy must be able to reach the host."}
              </div>
            )}

            <div className="space-y-2">
              <Label>Default model</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={tile.defaultModel ?? "model id"}
              />
              <p className="text-meta text-muted-foreground">
                Used when a client request omits the <code>model</code> field. You can attach
                more models from other providers on the next step.
              </p>
            </div>

            {/* Glassmorphic Quota & Cost Control */}
            <div className="space-y-4 rounded-xl border border-primary/10 bg-primary/[0.02] p-5 backdrop-blur-md hover:border-primary/20 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2.5">
                <Coins className="h-4 w-4 text-indigo-400" />
                <h4 className="text-sm font-semibold tracking-wide text-foreground">Spend Limits & Quotas</h4>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="spendLimit" className="text-xs font-medium text-muted-foreground tracking-wider uppercase">Spend Limit (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">$</span>
                    <Input
                      id="spendLimit"
                      type="number"
                      step="0.01"
                      min="0"
                      value={spendLimitUsd}
                      onChange={(e) => setSpendLimitUsd(e.target.value)}
                      placeholder="e.g. 50.00"
                      className="pl-7 font-mono bg-background/50 border-border/80 focus:border-indigo-500/50 focus:ring-indigo-500/10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tokenLimit" className="text-xs font-medium text-muted-foreground tracking-wider uppercase">Token Budget</Label>
                  <Input
                    id="tokenLimit"
                    type="number"
                    min="0"
                    value={tokenLimit}
                    onChange={(e) => setTokenLimit(e.target.value)}
                    placeholder="e.g. 10000000"
                    className="font-mono bg-background/50 border-border/80 focus:border-indigo-500/50 focus:ring-indigo-500/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="limitWindow" className="text-xs font-medium text-muted-foreground tracking-wider uppercase">Renewal Window</Label>
                  <Select value={limitWindow} onValueChange={(v: any) => setLimitWindow(v)}>
                    <SelectTrigger id="limitWindow" className="bg-background/50 border-border/80 focus:border-indigo-500/50">
                      <SelectValue placeholder="Renewal cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="infinite">No auto-renewal</SelectItem>
                      <SelectItem value="daily">Daily reset</SelectItem>
                      <SelectItem value="monthly">Monthly reset</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-meta text-muted-foreground font-sans">
                Automatically rejects incoming LLM requests if thresholds are breached, preventing runaway API bills.
              </p>
            </div>

            {testResult && (
              <div
                className={cn(
                  "rounded-md border px-3 py-2 text-meta font-mono",
                  testResult.ok
                    ? "border-status-ok/40 bg-status-ok/10 text-status-ok"
                    : "border-status-err/40 bg-status-err/10 text-status-err",
                )}
              >
                {testResult.ok ? "✓ " : "✗ "}
                {testResult.msg}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Change provider
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={runTest} disabled={!canTest || testing}>
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Test
              </Button>
              <Button
                variant="outline"
                onClick={() => createKey.mutate({ nextStep: 3 })}
                disabled={!canTest || createKey.isPending}
                title="Create a 1:1 key bound only to this provider"
              >
                {createKey.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Finish — use just {tile.label}
              </Button>
              <Button
                onClick={() => createKey.mutate({ nextStep: 2 })}
                disabled={!canTest || createKey.isPending}
                title="Create the key, then attach more LLMs as a unified gateway"
              >
                {createKey.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add more LLMs <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — add more LLMs (optional) ----------------------------- */}
      {step === 2 && created && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  Want a unified gateway? Attach more LLMs (optional).
                </CardTitle>
                <p className="text-meta text-muted-foreground mt-1.5">
                  Skip this step for a 1:1 key, or add as many providers as
                  you want under the same AnveGuard key.
                </p>
              </div>
              {!editKeyId && (
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                  Skip — I only need one provider
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Edit-mode workspace settings ----------------------------- */}
            {editKeyId && (
              <div className="rounded-md border border-border surface-1 p-4 space-y-4 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Workspace settings</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-meta">Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Workspace name"
                      maxLength={120}
                      className="h-9 bg-background/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-meta">Default model</Label>
                    <Input
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="model id"
                      className="h-9 bg-background/50"
                    />
                  </div>
                </div>

                {/* Cost Controls */}
                <div className="border-t border-border/30 pt-3 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cost limits & renewal cycle</span>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-meta text-xs">Spend Limit (USD)</Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editSpendLimitUsd}
                          onChange={(e) => setEditSpendLimitUsd(e.target.value)}
                          placeholder="e.g. 50.00"
                          className="pl-6 h-8 text-xs font-mono bg-background/40"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-meta text-xs">Token Budget</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editTokenLimit}
                        onChange={(e) => setEditTokenLimit(e.target.value)}
                        placeholder="e.g. 10000000"
                        className="h-8 text-xs font-mono bg-background/40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-meta text-xs">Renewal Window</Label>
                      <Select value={editLimitWindow} onValueChange={(v: any) => setEditLimitWindow(v)}>
                        <SelectTrigger className="h-8 text-xs bg-background/40">
                          <SelectValue placeholder="Renewal cycle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="infinite">No auto-renewal</SelectItem>
                          <SelectItem value="daily">Daily reset</SelectItem>
                          <SelectItem value="monthly">Monthly reset</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openChangeProvider}
                    title="Repoint this workspace to a different upstream provider"
                  >
                    <Plug className="mr-1 h-3.5 w-3.5" />
                    Change primary provider
                    {tile && <span className="ml-2 text-muted-foreground font-mono">· {tile.label}</span>}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    onClick={() => {
                      const patch: Record<string, unknown> = {};
                      if (editName.trim() && editName !== name) patch.name = editName.trim();
                      if (editModel.trim() && editModel !== model) patch.model_default = editModel.trim();
                      
                      const origKey = existingKeys?.keys.find((row) => row.id === editKeyId);
                      const origSpend = origKey?.spend_limit_usd != null ? String(origKey.spend_limit_usd) : "";
                      const origToken = origKey?.token_limit != null ? String(origKey.token_limit) : "";
                      const origWindow = origKey?.limit_window || "infinite";

                      if (editSpendLimitUsd !== origSpend) {
                        patch.spend_limit_usd = editSpendLimitUsd === "" ? null : parseFloat(editSpendLimitUsd);
                      }
                      if (editTokenLimit !== origToken) {
                        patch.token_limit = editTokenLimit === "" ? null : parseInt(editTokenLimit, 10);
                      }
                      if (editLimitWindow !== origWindow) {
                        patch.limit_window = editLimitWindow;
                      }

                      if (Object.keys(patch).length === 0) {
                        toast.info("No changes");
                        return;
                      }
                      updateKey.mutate(patch, {
                        onSuccess: () => {
                          if (patch.name) setName(String(patch.name));
                          if (patch.model_default) setModel(String(patch.model_default));
                        },
                      });
                    }}
                    disabled={updateKey.isPending}
                  >
                    {updateKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save changes
                  </Button>
                </div>
              </div>
            )}

            <p className="text-meta text-muted-foreground">
              Each model you add gets its own name (alias). Your apps just pass{" "}
              <code>model="..."</code> and AnveGuard routes to the right
              upstream — all governed by the same policies & logged together.
            </p>

            {/* Current models */}
            <div className="space-y-2">
              <Label className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                Models on this key
              </Label>
              <div className="rounded-md border border-border surface-1 divide-y divide-border">
                {tile && (
                  <div className="flex items-center justify-between px-3 py-2 text-meta">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="font-mono text-meta">primary</Badge>
                      <code className="font-mono truncate">{(editKeyId ? editModel : model) || tile.defaultModel}</code>
                    </div>
                    <span className="text-muted-foreground">{tile.label}</span>
                  </div>
                )}

                {(aliasesQuery.data?.aliases ?? []).map((a) => {
                  const ep = a.target_endpoint_id ? endpointById[a.target_endpoint_id] : null;
                  return (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 text-meta">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="font-mono text-meta">alias</Badge>
                        <code className="font-mono truncate">{a.alias}</code>
                        <span className="text-muted-foreground hidden sm:inline">→ {a.target_model}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{ep?.name ?? "primary"}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAlias.mutate(a.id)}
                          title="Remove model"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {(aliasesQuery.data?.aliases ?? []).length === 0 && !tile && (
                  <div className="px-3 py-4 text-meta text-muted-foreground">
                    No extra models yet. Pick a provider below to add one.
                  </div>
                )}
              </div>
            </div>

            {/* Add-provider tile grid (drawer-style: shows form inline below) */}
            {!extraDrawerTile ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                    Add another provider
                  </Label>
                  {unattachedEndpoints.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAttachEndpointId(unattachedEndpoints[0].id);
                        setAttachAlias(unattachedEndpoints[0].default_model ?? "");
                        setAttachExistingOpen(true);
                      }}
                      title="Reuse an endpoint you've already configured"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Attach existing endpoint
                    </Button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {TILES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openExtraDrawer(t)}
                      className="text-left rounded-md border border-border surface-1 px-3 py-2 hover:border-primary/60 hover:surface-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-meta">{t.label}</span>
                        {t.badge && (
                          <Badge variant="outline" className="text-meta font-mono">{t.badge}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-meta text-muted-foreground line-clamp-1">{t.blurb}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-primary/40 surface-2 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-primary" />
                    <span className="font-medium">{extraDrawerTile.label}</span>
                    <a
                      href={extraDrawerTile.getKeyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-meta text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      Get a key <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <Button variant="ghost" size="icon" onClick={closeExtraDrawer}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {extraDrawerTile.id === "custom" && (
                  <div className="space-y-1.5">
                    <Label className="text-meta">Base URL</Label>
                    <Input
                      value={extraCustomBaseUrl}
                      onChange={(e) => setExtraCustomBaseUrl(e.target.value)}
                      placeholder="https://your-host.example.com"
                    />
                  </div>
                )}

                {extraDrawerTile.needsKey && (
                  <div className="space-y-1.5">
                    <Label className="text-meta">{extraDrawerTile.label} API key</Label>
                    <Input
                      type="password"
                      value={extraProviderKey}
                      onChange={(e) => setExtraProviderKey(e.target.value)}
                      placeholder={extraDrawerTile.keyHint || "Paste your key"}
                      autoComplete="off"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-meta">Model name (alias)</Label>
                  <Input
                    value={extraAlias}
                    onChange={(e) => setExtraAlias(e.target.value)}
                    placeholder={extraDrawerTile.defaultModel ?? "model id"}
                  />
                  <p className="text-meta text-muted-foreground">
                    Your apps will call this with <code>model="{extraAlias || extraDrawerTile.defaultModel}"</code>.
                    {extraDrawerTile.modelSuggestions && (
                      <span className="block mt-1">
                        Suggestions:{" "}
                        {extraDrawerTile.modelSuggestions.map((s, i) => (
                          <button
                            key={s}
                            onClick={() => setExtraAlias(s)}
                            className="underline hover:text-foreground mr-2"
                          >
                            {s}{i < extraDrawerTile.modelSuggestions!.length - 1 ? "" : ""}
                          </button>
                        ))}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="ghost" onClick={closeExtraDrawer}>Cancel</Button>
                  <div className="flex-1" />
                  <Button onClick={saveExtraProvider} disabled={extraSaving}>
                    {extraSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Attach provider
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {!editKeyId && (
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
                </Button>
              )}
              <div className="flex-1" />
              {editKeyId ? (
                <Button onClick={() => navigate("/dashboard/keys")}>
                  Done <Check className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => setStep(3)}>
                  Continue to credentials <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — credentials ------------------------------------------ */}
      {step === 3 && created && tile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-status-ok" />
              Workspace ready — {routableModels.length} model{routableModels.length === 1 ? "" : "s"} routable
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-md border border-status-warn/40 bg-status-warn/5 px-3 py-2 text-meta text-status-warn">
              This is the only time the full key is shown. Copy it now — we only store its SHA-256 hash.
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <CredField label="Base URL" value={`${PROXY_URL}/v1`} onCopy={copy} />
              <CredField
                label="API Key"
                value={revealKey ? created.fullKey : `${created.fullKey.slice(0, 12)}••••••••`}
                onCopy={() => copy(created.fullKey, "API key")}
                trailing={
                  <Button variant="ghost" size="sm" onClick={() => setRevealKey((v) => !v)}>
                    {revealKey ? "Hide" : "Show"}
                  </Button>
                }
              />
            </div>

            {routableModels.length > 1 && (
              <div className="rounded-md border border-border surface-1 p-3">
                <Label className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                  Models routable from this key
                </Label>
                <ul className="mt-2 space-y-1 text-meta font-mono">
                  {routableModels.map((r) => (
                    <li key={r.model} className="flex items-center justify-between gap-2">
                      <code className="truncate">{r.model}</code>
                      <span className="text-muted-foreground">→ {r.via}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <SnippetTabs
              apiKey={created.fullKey}
              baseUrl={`${PROXY_URL}/v1`}
              models={routableModels.map((r) => r.model)}
            />

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button onClick={sendTestRequest} disabled={sendingTest}>
                {sendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Terminal className="mr-2 h-4 w-4" />}
                Send test request
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard/logs")}>
                Open Logs <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => navigate("/dashboard/keys")}>
                <KeyRound className="mr-1 h-4 w-4" /> All keys
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Add more LLMs
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer helper */}
      {step < 2 && (
        <div className="text-meta text-muted-foreground">
          Need something exotic (per-key headers, custom paths, multi-step routes)?{" "}
          <button
            onClick={() => navigate("/dashboard/endpoints")}
            className="underline hover:text-foreground"
          >
            Open advanced Endpoints
          </button>{" "}
          — the wizard covers ~95% of cases.
        </div>
      )}

      {step === 1 && (
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
        </Button>
      )}

      {/* ---- Change-provider dialog (edit mode) -------------------- */}
      <Dialog open={changeProviderOpen} onOpenChange={setChangeProviderOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Change primary provider</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-status-warn/40 bg-status-warn/5 px-3 py-2 text-meta text-status-warn">
              All requests that don't match an alias will route to the new provider. Existing aliases keep their own upstreams.
            </div>
            {!swapTile ? (
              <div className="grid sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
                {TILES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSwapTile(t);
                      setSwapKey("");
                      setSwapBaseUrl("");
                    }}
                    className="text-left rounded-md border border-border surface-1 px-3 py-2 hover:border-primary/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-meta">{t.label}</span>
                      {t.badge && <Badge variant="outline" className="text-meta font-mono">{t.badge}</Badge>}
                    </div>
                    <p className="mt-1 text-meta text-muted-foreground line-clamp-1">{t.blurb}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-primary" />
                  <span className="font-medium">{swapTile.label}</span>
                  <button onClick={() => setSwapTile(null)} className="text-meta text-muted-foreground hover:text-foreground ml-auto">
                    Change
                  </button>
                </div>
                {swapTile.id === "custom" && (
                  <div className="space-y-1.5">
                    <Label className="text-meta">Base URL</Label>
                    <Input
                      value={swapBaseUrl}
                      onChange={(e) => setSwapBaseUrl(e.target.value)}
                      placeholder="https://your-host.example.com"
                    />
                  </div>
                )}
                {swapTile.needsKey && (
                  <div className="space-y-1.5">
                    <Label className="text-meta">{swapTile.label} API key</Label>
                    <Input
                      type="password"
                      value={swapKey}
                      onChange={(e) => setSwapKey(e.target.value)}
                      placeholder={swapTile.keyHint || "Paste your key"}
                      autoComplete="off"
                    />
                    <p className="text-meta text-muted-foreground">
                      Replaces the current upstream key. Stored AES-GCM encrypted.
                    </p>
                  </div>
                )}
                {!swapTile.needsKey && (
                  <div className="rounded-md border border-border surface-2 px-3 py-2 text-meta text-muted-foreground">
                    No upstream key needed for {swapTile.label}.
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChangeProviderOpen(false)}>Cancel</Button>
            <Button onClick={confirmSwap} disabled={!swapTile}>
              Switch provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Attach existing endpoint dialog ---------------------- */}
      <Dialog open={attachExistingOpen} onOpenChange={setAttachExistingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach an existing endpoint</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-meta text-muted-foreground">
              Reuse an endpoint you've already configured. We'll create an alias on this connector that routes to it.
            </p>
            <div className="space-y-1.5">
              <Label className="text-meta">Endpoint</Label>
              <Select value={attachEndpointId} onValueChange={(v) => {
                setAttachEndpointId(v);
                const ep = endpointById[v];
                if (ep) setAttachAlias(ep.default_model ?? ep.name);
              }}>
                <SelectTrigger><SelectValue placeholder="Pick an endpoint" /></SelectTrigger>
                <SelectContent>
                  {unattachedEndpoints.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} · <span className="text-muted-foreground font-mono">{e.kind}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-meta">Alias (model name your apps will call)</Label>
              <Input
                value={attachAlias}
                onChange={(e) => setAttachAlias(e.target.value)}
                placeholder="model id"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAttachExistingOpen(false)}>Cancel</Button>
            <Button onClick={submitAttachExisting} disabled={!attachEndpointId || !attachAlias.trim()}>
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function CredField({
  label,
  value,
  onCopy,
  trailing,
}: {
  label: string;
  value: string;
  onCopy: (s: string, label: string) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Input readOnly value={value} className="font-mono text-meta" />
        <Button variant="ghost" size="icon" onClick={() => onCopy(value, label)} title={`Copy ${label}`}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {trailing}
      </div>
    </div>
  );
}

function SnippetTabs({ apiKey, baseUrl, models }: { apiKey: string; baseUrl: string; models: string[] }) {
  const masked = `${apiKey.slice(0, 12)}…`;
  const primary = models[0] || "gpt-5-mini";
  const second = models[1];
  // Multi-model Python sample shows how one client can call two upstreams
  // just by changing the model string — that's the whole point of unifying.
  const pyMulti = second
    ? `
# Same client, different upstream — AnveGuard routes by model name
resp2 = client.chat.completions.create(
    model="${second}",
    messages=[{"role": "user", "content": "Hello from ${second}"}],
)`
    : "";
  const nodeMulti = second
    ? `

const resp2 = await client.chat.completions.create({
  model: "${second}",
  messages: [{ role: "user", content: "Hello from ${second}" }],
});`
    : "";

  const snippets: Record<string, string> = {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="${masked}",            # your AnveGuard key
    base_url="${baseUrl}",
)

resp = client.chat.completions.create(
    model="${primary}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)${pyMulti}`,
    node: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${masked}",
  baseURL: "${baseUrl}",
});

const resp = await client.chat.completions.create({
  model: "${primary}",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(resp.choices[0].message.content);${nodeMulti}`,
    curl: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${masked}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${primary}",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
  };

  return (
    <Tabs defaultValue="python">
      <TabsList>
        <TabsTrigger value="python">Python</TabsTrigger>
        <TabsTrigger value="node">Node</TabsTrigger>
        <TabsTrigger value="curl">curl</TabsTrigger>
      </TabsList>
      {Object.entries(snippets).map(([k, v]) => (
        <TabsContent key={k} value={k}>
          <pre className="rounded-md border border-border surface-2 p-4 text-meta font-mono overflow-x-auto whitespace-pre">
            {v}
          </pre>
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default Connect;
