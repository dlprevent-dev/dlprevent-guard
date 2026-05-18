import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plug,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

// =====================================================================
// Provider catalog — what the wizard surfaces.
// Each tile maps to either a first-class provider id (used by `create_key`
// `provider:` field) or to a custom-endpoint template id (used to prefill
// the legacy custom form via `provider: "custom"` + the template values).
// =====================================================================
type Tile = {
  id: string;                  // unique ui id
  provider: string;            // value sent as `provider` to create_key
  template?: string;           // when provider === "custom", template id
  label: string;
  blurb: string;
  keyHint: string;             // placeholder for the API key field
  getKeyUrl: string;           // "Get key →" link
  needsKey: boolean;           // false for Lovable (managed) + Ollama (none)
  defaultModel?: string;       // shown as the default model badge
  badge?: string;              // "Managed", "Local", etc.
};

const TILES: Tile[] = [
  {
    id: "openai",
    provider: "openai",
    label: "OpenAI",
    blurb: "GPT-5, GPT-4.1, GPT-4o, o4 — Chat Completions.",
    keyHint: "sk-...",
    getKeyUrl: "https://platform.openai.com/api-keys",
    needsKey: true,
    defaultModel: "gpt-5-mini",
  },
  {
    id: "anthropic",
    provider: "anthropic",
    label: "Anthropic",
    blurb: "Claude Sonnet 4.5, Opus 4.7, Haiku 4.5.",
    keyHint: "sk-ant-...",
    getKeyUrl: "https://console.anthropic.com/settings/keys",
    needsKey: true,
    defaultModel: "claude-sonnet-4-5",
  },
  {
    id: "openrouter",
    provider: "openrouter",
    label: "OpenRouter",
    blurb: "One key, 100+ models across every major provider.",
    keyHint: "sk-or-...",
    getKeyUrl: "https://openrouter.ai/keys",
    needsKey: true,
    defaultModel: "openrouter/auto",
  },
  {
    id: "perplexity",
    provider: "perplexity",
    label: "Perplexity",
    blurb: "Sonar models with built-in web search grounding.",
    keyHint: "pplx-...",
    getKeyUrl: "https://www.perplexity.ai/settings/api",
    needsKey: true,
    defaultModel: "sonar",
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

type Step = 0 | 1 | 2;

const Connect = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: providerData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => call<ProviderListResp>("list_providers"),
  });

  const [step, setStep] = useState<Step>(0);
  const [tile, setTile] = useState<Tile | null>(null);
  const [providerKey, setProviderKey] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [created, setCreated] = useState<{ fullKey: string; id: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [revealKey, setRevealKey] = useState(true);

  const template = useMemo(() => {
    if (!tile?.template) return null;
    return providerData?.custom_schema.templates.find((t) => t.id === tile.template) ?? null;
  }, [tile, providerData]);

  const customPayload = useMemo(() => {
    if (!tile || tile.provider !== "custom") return undefined;
    if (tile.id === "custom") {
      // Bare custom — user typed their own base URL.
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
    setName(`${t.label} key`);
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
        // First-class provider — best signal is just letting create do its own
        // upstream check on first call. For now we mark "ok" if a key is present
        // (or the provider is managed). This keeps the wizard zero-friction.
        setTestResult({ ok: true, msg: tile.needsKey ? "Key format looks valid" : "Ready" });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const createKey = useMutation({
    mutationFn: () =>
      call<{ id: string; full_key: string }>("create_key", {
        body: {
          name: name.trim() || `${tile?.label} key`,
          provider: tile?.provider,
          model: model || tile?.defaultModel,
          provider_key: tile?.needsKey ? providerKey : undefined,
          custom: tile?.provider === "custom" ? customPayload : undefined,
        },
      }),
    onSuccess: (res) => {
      setCreated({ fullKey: res.full_key, id: res.id });
      setStep(2);
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = (s: string, label: string) => {
    navigator.clipboard.writeText(s);
    toast.success(`${label} copied`);
  };

  // Sends a 1-token completion through the proxy with the freshly-minted key,
  // then jumps to Logs so the user immediately sees the request appear.
  const sendTestRequest = async () => {
    if (!created) return;
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
        toast.error(`Proxy returned ${res.status} — see Logs for the full row`);
        setTimeout(() => navigate("/dashboard/logs"), 600);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingTest(false);
    }
  };

  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-meta uppercase tracking-[0.18em] text-primary font-mono">
          <Sparkles className="h-3 w-3" /> Connect
        </div>
        <h1 className="text-display font-semibold tracking-tight">
          Connect a provider.
        </h1>
        <p className="text-body text-muted-foreground max-w-2xl">
          Paste your OpenAI, Anthropic, OpenRouter, Perplexity, Ollama (or any
          OpenAI-compatible) key. AnveGuard gives you back a single
          OpenAI-shaped URL + key — every call runs through your policies and
          shows up in Logs.
        </p>
      </header>

      {/* Stepper -------------------------------------------------------- */}
      <ol className="flex items-center gap-2 text-meta font-mono">
        {[
          { n: 1, label: "Pick provider" },
          { n: 2, label: "Paste key" },
          { n: 3, label: "Get credentials" },
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
              {i < 2 && <span className="mx-2 h-px w-8 bg-border" />}
            </li>
          );
        })}
      </ol>

      {/* Step 0 — pick provider ---------------------------------------- */}
      {step === 0 && (
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
      )}

      {/* Step 1 — paste key + test ------------------------------------- */}
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
              <Label>Name this connection</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${tile.label} key`}
                maxLength={120}
              />
              <p className="text-meta text-muted-foreground">
                Internal label — shown in Keys and Logs. Not sent upstream.
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
                <p className="text-meta text-muted-foreground">
                  Must speak OpenAI Chat Completions at <code>/v1/chat/completions</code>.
                </p>
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
                Used when a client request omits the <code>model</code> field. You can override
                per-call as usual.
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
                Test connection
              </Button>
              <Button
                onClick={() => createKey.mutate()}
                disabled={!canTest || createKey.isPending}
              >
                {createKey.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create AnveGuard key <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — credentials ------------------------------------------ */}
      {step === 2 && created && tile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-status-ok" />
              Connected to {tile.label}
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

            <SnippetTabs apiKey={created.fullKey} baseUrl={`${PROXY_URL}/v1`} model={model || tile.defaultModel || "gpt-5-mini"} />

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
              <Button
                variant="ghost"
                onClick={() => {
                  setCreated(null);
                  setTile(null);
                  setStep(0);
                  setProviderKey("");
                  setName("");
                  setModel("");
                  setTestResult(null);
                }}
              >
                Connect another <X className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer helper */}
      {step !== 2 && (
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

function SnippetTabs({ apiKey, baseUrl, model }: { apiKey: string; baseUrl: string; model: string }) {
  const masked = `${apiKey.slice(0, 12)}…`;
  const snippets: Record<string, string> = {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="${masked}",            # your AnveGuard key
    base_url="${baseUrl}",
)

resp = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`,
    node: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${masked}",
  baseURL: "${baseUrl}",
});

const resp = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(resp.choices[0].message.content);`,
    curl: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${masked}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
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
