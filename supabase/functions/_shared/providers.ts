// Single source of truth for upstream LLM providers AnveGuard can proxy to.

export type ProviderKind = "openai_compatible" | "anthropic";

export interface ProviderDef {
  id: string;
  label: string;
  kind: ProviderKind;
  url: string;
  /** GET endpoint that returns available models. Omit for managed providers w/o one. */
  models_url?: string;
  /** If true, no user-provided key is required (server uses LOVABLE_API_KEY). */
  managed?: boolean;
  default_model: string;
  model_suggestions: string[];
  key_placeholder: string;
  get_key_url: string;
  /**
   * Optional predicate to keep only models the provider's chat endpoint can
   * actually accept. Some providers (notably Perplexity) advertise external
   * vendor models in their `/v1/models` list that they don't actually serve.
   * Receives the parsed model object (id + owned_by + display_name).
   */
  model_id_filter?: (m: { id: string; owned_by?: string | null }) => boolean;
  /**
   * Optional rewriter to translate a model id into the form the chat endpoint
   * expects. E.g. Perplexity returns `perplexity/sonar` from `/v1/models` but
   * its `/chat/completions` only accepts the bare `sonar`.
   */
  model_id_normalize?: (id: string) => string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "lovable",
    label: "Lovable AI (managed)",
    kind: "openai_compatible",
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    managed: true,
    default_model: "google/gemini-3-flash-preview",
    model_suggestions: [
      "google/gemini-3.1-pro-preview",
      "google/gemini-3-flash-preview",
      "google/gemini-3.1-flash-image-preview",
      "google/gemini-3-pro-image-preview",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
      "openai/gpt-5.2",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
    ],
    key_placeholder: "",
    get_key_url: "https://docs.lovable.dev/features/ai",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai_compatible",
    url: "https://api.openai.com/v1/chat/completions",
    models_url: "https://api.openai.com/v1/models",
    default_model: "gpt-5-mini",
    model_suggestions: [
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-4.1-mini",
      "gpt-4o-mini",
      "gpt-4o",
      "o4-mini",
    ],
    key_placeholder: "sk-...",
    get_key_url: "https://platform.openai.com/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai_compatible",
    url: "https://openrouter.ai/api/v1/chat/completions",
    models_url: "https://openrouter.ai/api/v1/models",
    default_model: "openrouter/auto",
    model_suggestions: [
      "openrouter/auto",
      "anthropic/claude-sonnet-4-5",
      "anthropic/claude-opus-4-7",
      "openai/gpt-5-mini",
      "google/gemini-2.5-flash",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    key_placeholder: "sk-or-...",
    get_key_url: "https://openrouter.ai/keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    models_url: "https://api.anthropic.com/v1/models",
    default_model: "claude-sonnet-4-5",
    model_suggestions: [
      "claude-opus-4-7",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
    ],
    key_placeholder: "sk-ant-...",
    get_key_url: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "perplexity",
    label: "Perplexity (Sonar)",
    kind: "openai_compatible",
    url: "https://api.perplexity.ai/chat/completions",
    models_url: "https://api.perplexity.ai/v1/models",
    default_model: "sonar",
    model_suggestions: ["sonar", "sonar-pro", "sonar-reasoning-pro", "sonar-deep-research"],
    key_placeholder: "pplx-...",
    get_key_url: "https://www.perplexity.ai/settings/api",
    // Perplexity's /v1/models advertises external vendor ids (openai/*,
    // anthropic/*, nvidia/*, xai/*) that their /chat/completions endpoint
    // does NOT actually accept. Keep only ids Perplexity itself serves.
    model_id_filter: (m) => {
      const id = (m.id || "").toLowerCase();
      const owner = (m.owned_by || "").toLowerCase();
      if (owner === "perplexity") return true;
      if (id.startsWith("perplexity/")) return true;
      if (/^sonar(\b|[-/])/.test(id)) return true;
      return false;
    },
    // /v1/models returns "perplexity/sonar"; /chat/completions wants "sonar".
    model_id_normalize: (id) => id.replace(/^perplexity\//, ""),
  },
  {
    id: "kimi",
    label: "Moonshot Kimi",
    kind: "openai_compatible",
    url: "https://api.moonshot.ai/v1/chat/completions",
    models_url: "https://api.moonshot.ai/v1/models",
    default_model: "kimi-k2-turbo-preview",
    model_suggestions: [
      "kimi-k2-turbo-preview",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
      "moonshot-v1-auto",
    ],
    key_placeholder: "sk-...",
    get_key_url: "https://platform.moonshot.ai/console/api-keys",
  },
  {
    id: "qwen",
    label: "Alibaba Qwen (DashScope)",
    kind: "openai_compatible",
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    models_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
    default_model: "qwen-plus",
    model_suggestions: ["qwen-plus", "qwen-max", "qwen-flash", "qwen-turbo"],
    key_placeholder: "sk-...",
    get_key_url: "https://dashscope.console.aliyun.com/apiKey",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    kind: "openai_compatible", // overridden per-key by custom_kind
    url: "", // resolved per-key from custom_base_url
    default_model: "",
    model_suggestions: [],
    key_placeholder: "your provider key (or leave blank)",
    get_key_url: "https://platform.openai.com/docs/api-reference/chat",
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// =====================================================================
// Custom endpoint support
// =====================================================================

export type AuthScheme = "bearer" | "header" | "x-api-key" | "query" | "none";

/** Wire format the upstream server speaks. We translate request/response shapes per format. */
export type ResponseFormat = "chat_completions" | "responses" | "anthropic_messages";

export interface CustomEndpointInput {
  base_url: string;
  models_url?: string | null;
  kind: ProviderKind;
  auth_scheme: AuthScheme;
  auth_header?: string | null;
  extra_headers?: Record<string, string> | null;
  /** e.g. "/v1", "/openai/v1" — appended to base_url before the chat/models suffix. */
  path_prefix?: string | null;
  /** Explicit chat path (overrides default suffix). e.g. "/chat/completions", "/responses". */
  chat_path?: string | null;
  /** Explicit models path (overrides default "/models"). */
  models_path?: string | null;
  /** Wire format. Defaults to chat_completions for openai_compatible, anthropic_messages for anthropic. */
  response_format?: ResponseFormat | null;
}

export interface ResolvedEndpoint {
  url: string;
  models_url: string;
  kind: ProviderKind;
  /** Base headers minus auth (auth is applied by the proxy with the decrypted upstream key). */
  extra_headers: Record<string, string>;
  auth_scheme: AuthScheme;
  auth_header: string;
  response_format: ResponseFormat;
}

/** Provider-form choices we expose to the UI so it stays data-driven. */
export const CUSTOM_SCHEMA = {
  kinds: [
    { id: "openai_compatible", label: "OpenAI-compatible (/v1/chat/completions)" },
    { id: "anthropic", label: "Anthropic-compatible (/v1/messages)" },
  ],
  auth_schemes: [
    { id: "bearer", label: "Bearer token (Authorization: Bearer …)" },
    { id: "header", label: "Custom header" },
    { id: "x-api-key", label: "x-api-key header" },
    { id: "query", label: "Query parameter (e.g. ?key=…)" },
    { id: "none", label: "No auth (e.g. local Ollama)" },
  ],
  // Each template prefills the entire endpoint form. UI consumers should treat
  // every field as optional and only apply ones that are present.
  templates: [
    {
      id: "lovable_managed",
      label: "Lovable AI (managed)",
      description: "Hosted gateway across Gemini and GPT-5. No API key needed — uses your Lovable Cloud workspace credits.",
      category: "managed",
      managed: true,
      values: {
        kind: "openai_compatible",
        base_url: "https://ai.gateway.lovable.dev",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "none",
        response_format: "chat_completions",
        default_model: "google/gemini-3-flash-preview",
        model_suggestions: "google/gemini-3.1-pro-preview, google/gemini-3-flash-preview, google/gemini-2.5-pro, google/gemini-2.5-flash, google/gemini-2.5-flash-lite, openai/gpt-5, openai/gpt-5-mini, openai/gpt-5-nano, openai/gpt-5.2",
      },
    },
    {
      id: "openai",
      label: "OpenAI",
      description: "OpenAI Chat Completions (gpt-5, gpt-4.1, gpt-4o, o4). Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.openai.com",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "gpt-5-mini",
        model_suggestions: "gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1-mini, gpt-4o-mini, gpt-4o, o4-mini",
      },
    },
    {
      id: "gemini",
      label: "Google Gemini",
      description: "Google AI Studio's OpenAI-compatible endpoint. Bearer token from aistudio.google.com.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://generativelanguage.googleapis.com",
        path_prefix: "/v1beta/openai",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "gemini-2.5-flash",
        model_suggestions: "gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash",
      },
    },
    {
      id: "perplexity",
      label: "Perplexity (Sonar)",
      description: "Sonar models with built-in web search. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.perplexity.ai",
        chat_path: "/chat/completions",
        models_path: "/v1/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "sonar",
        model_suggestions: "sonar, sonar-pro, sonar-reasoning-pro, sonar-deep-research",
      },
    },
    {
      id: "ollama",
      label: "Ollama (local)",
      description: "Run llama.cpp / Ollama on your machine. No auth needed.",
      category: "self_hosted",
      values: {
        kind: "openai_compatible",
        base_url: "http://localhost:11434",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "none",
        response_format: "chat_completions",
        default_model: "llama3.1",
        model_suggestions: "llama3.1, llama3.2, qwen2.5, mistral, gpt-oss:20b",
      },
    },

    {
      id: "vllm",
      label: "vLLM / LM Studio / TGI",
      description: "Self-hosted OpenAI-compatible server. Bearer token (often any string). Tip: run `curl http://localhost:8000/v1/models` to discover the served model id.",
      category: "self_hosted",
      values: {
        kind: "openai_compatible",
        base_url: "http://localhost:8000",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "",
        model_suggestions: "",
      },
    },
    {
      id: "azure_openai",
      label: "Azure OpenAI",
      description: "Replace YOUR-RESOURCE with your Azure resource name. Default model must be your Azure deployment name (not the underlying model name). Uses api-key header + api-version.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://YOUR-RESOURCE.openai.azure.com",
        path_prefix: "/openai/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "header",
        auth_header: "api-key",
        response_format: "chat_completions",
        default_model: "gpt-4o-mini",
        model_suggestions: "gpt-4o-mini, gpt-4o, gpt-4.1-mini, o4-mini",
        extra_headers: { "api-version": "2024-10-21" },
      },
    },
    {
      id: "groq",
      label: "Groq",
      description: "Fast inference for Llama, GPT-OSS, Gemma, DeepSeek. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.groq.com",
        path_prefix: "/openai/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "llama-3.3-70b-versatile",
        model_suggestions: "llama-3.3-70b-versatile, llama-3.1-8b-instant, openai/gpt-oss-120b, openai/gpt-oss-20b, gemma2-9b-it, deepseek-r1-distill-llama-70b",
      },
    },
    {
      id: "anthropic",
      label: "Anthropic (Claude)",
      description: "Direct Anthropic Messages API. Uses x-api-key + anthropic-version.",
      category: "hosted",
      values: {
        kind: "anthropic",
        base_url: "https://api.anthropic.com",
        path_prefix: "/v1",
        chat_path: "/messages",
        models_path: "/models",
        auth_scheme: "x-api-key",
        response_format: "anthropic_messages",
        default_model: "claude-sonnet-4-5",
        model_suggestions: "claude-opus-4-7, claude-sonnet-4-5, claude-haiku-4-5",
        extra_headers: { "anthropic-version": "2023-06-01" },
      },
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      description: "One API for many providers. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://openrouter.ai",
        path_prefix: "/api/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "openrouter/auto",
        model_suggestions: "openrouter/auto, anthropic/claude-3.5-sonnet, openai/gpt-4o-mini, meta-llama/llama-3.1-70b-instruct",
      },
    },
    {
      id: "together",
      label: "Together AI",
      description: "Open-source models. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.together.xyz",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        model_suggestions: "meta-llama/Llama-3.3-70B-Instruct-Turbo, meta-llama/Llama-3.1-8B-Instruct-Turbo, Qwen/Qwen2.5-72B-Instruct-Turbo",
      },
    },
    {
      id: "fireworks",
      label: "Fireworks",
      description: "Fast hosted open-source models. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.fireworks.ai",
        path_prefix: "/inference/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        model_suggestions: "accounts/fireworks/models/llama-v3p3-70b-instruct, accounts/fireworks/models/qwen2p5-72b-instruct, accounts/fireworks/models/deepseek-v3, accounts/fireworks/models/mixtral-8x22b-instruct",
      },
    },
    {
      id: "xai",
      label: "xAI Grok",
      description: "Grok 4 models. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.x.ai",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "grok-4",
        model_suggestions: "grok-4, grok-4-fast-reasoning, grok-4-fast-non-reasoning, grok-3",
      },
    },
    {
      id: "mistral",
      label: "Mistral",
      description: "Mistral La Plateforme. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.mistral.ai",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "mistral-large-latest",
        model_suggestions: "mistral-large-latest, mistral-medium-latest, mistral-small-latest, codestral-latest, open-mistral-nemo",
      },
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      description: "DeepSeek chat + reasoner. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.deepseek.com",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "deepseek-chat",
        model_suggestions: "deepseek-chat, deepseek-reasoner",
      },
    },
    {
      id: "openai_responses",
      label: "OpenAI (Responses API)",
      description: "Hits /v1/responses instead of /v1/chat/completions. We translate request/response shapes.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.openai.com",
        path_prefix: "/v1",
        chat_path: "/responses",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "responses",
        default_model: "gpt-5-mini",
        model_suggestions: "gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1-mini",
      },
    },
    {
      id: "cohere",
      label: "Cohere",
      description: "Cohere Command models via the OpenAI compatibility API. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.cohere.ai",
        path_prefix: "/compatibility/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "command-r-plus",
        model_suggestions: "command-r-plus, command-r, command-a-03-2025, command-r7b",
      },
    },
    {
      id: "cerebras",
      label: "Cerebras",
      description: "Wafer-scale fast inference for Llama and Qwen. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.cerebras.ai",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "llama-3.3-70b",
        model_suggestions: "llama-3.3-70b, llama3.1-8b, qwen-3-32b, qwen-3-235b-a22b-instruct-2507",
      },
    },
    {
      id: "sambanova",
      label: "SambaNova",
      description: "SambaNova Cloud OpenAI-compatible API. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.sambanova.ai",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "Meta-Llama-3.3-70B-Instruct",
        model_suggestions: "Meta-Llama-3.3-70B-Instruct, Meta-Llama-3.1-8B-Instruct, Qwen2.5-72B-Instruct, DeepSeek-R1",
      },
    },
    {
      id: "hyperbolic",
      label: "Hyperbolic",
      description: "Hyperbolic OpenAI-compatible inference. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.hyperbolic.xyz",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "meta-llama/Meta-Llama-3-70B-Instruct",
        model_suggestions: "meta-llama/Meta-Llama-3-70B-Instruct, meta-llama/Meta-Llama-3.1-405B-Instruct, deepseek-ai/DeepSeek-V3, Qwen/Qwen2.5-72B-Instruct",
      },
    },
    {
      id: "nvidia_nim",
      label: "NVIDIA NIM",
      description: "NVIDIA build.nvidia.com integrate API. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://integrate.api.nvidia.com",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "meta/llama-3.1-70b-instruct",
        model_suggestions: "meta/llama-3.1-70b-instruct, meta/llama-3.1-405b-instruct, mistralai/mixtral-8x22b-instruct-v0.1, nvidia/nemotron-4-340b-instruct",
      },
    },
    {
      id: "huggingface",
      label: "Hugging Face Inference",
      description: "Unified OpenAI-compatible router across HF Inference Providers. Bearer token from huggingface.co.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://router.huggingface.co",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "meta-llama/Llama-3.1-8B-Instruct",
        model_suggestions: "meta-llama/Llama-3.1-8B-Instruct, meta-llama/Llama-3.3-70B-Instruct, Qwen/Qwen2.5-72B-Instruct, deepseek-ai/DeepSeek-V3",
      },
    },
    {
      id: "nebius",
      label: "Nebius AI Studio",
      description: "Nebius AI Studio OpenAI-compatible API. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.studio.nebius.com",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
        model_suggestions: "meta-llama/Meta-Llama-3.1-70B-Instruct, meta-llama/Meta-Llama-3.1-8B-Instruct, Qwen/Qwen2.5-72B-Instruct, deepseek-ai/DeepSeek-V3",
      },
    },
    {
      id: "novita",
      label: "Novita AI",
      description: "Novita AI OpenAI-compatible inference. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.novita.ai",
        path_prefix: "/v3/openai",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "meta-llama/llama-3.1-8b-instruct",
        model_suggestions: "meta-llama/llama-3.1-8b-instruct, meta-llama/llama-3.3-70b-instruct, qwen/qwen-2.5-72b-instruct, deepseek/deepseek-v3",
      },
    },
    {
      id: "moonshot",
      label: "Moonshot Kimi",
      description: "Moonshot Kimi OpenAI-compatible API. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://api.moonshot.ai",
        path_prefix: "/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "kimi-k2-turbo-preview",
        model_suggestions: "kimi-k2-turbo-preview, moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k, moonshot-v1-auto",
      },
    },
    {
      id: "qwen_dashscope",
      label: "Alibaba Qwen (DashScope)",
      description: "Alibaba DashScope OpenAI-compatibility endpoint. Bearer token.",
      category: "hosted",
      values: {
        kind: "openai_compatible",
        base_url: "https://dashscope-intl.aliyuncs.com",
        path_prefix: "/compatible-mode/v1",
        chat_path: "/chat/completions",
        models_path: "/models",
        auth_scheme: "bearer",
        response_format: "chat_completions",
        default_model: "qwen-plus",
        model_suggestions: "qwen-plus, qwen-max, qwen-flash, qwen-turbo, qwen2.5-72b-instruct",
      },
    },
  ],
};

const RESERVED_HEADERS = new Set([
  "authorization", "x-api-key", "content-type", "host",
]);

/** Sanitize user-supplied extra headers (drops reserved + empty + non-string). */
export function sanitizeExtraHeaders(
  input: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const [rawK, rawV] of Object.entries(input)) {
    if (typeof rawK !== "string" || typeof rawV !== "string") continue;
    const k = rawK.trim();
    const v = rawV.trim();
    if (!k || !v) continue;
    if (RESERVED_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.+\.local)$/i;

const BLOCKED_HOSTS = new Set([
  "169.254.169.254",          // AWS/GCP/Azure IMDS
  "metadata.google.internal", // GCE metadata
  "metadata",                  // alt GCE metadata alias
]);

/** Validate a user-supplied custom URL. Throws Error with a user-facing message. */
export function validateCustomUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("URL must use http or https");
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new Error("This host is not allowed");
  }
  if (u.protocol === "http:" && !PRIVATE_HOST_RE.test(host)) {
    throw new Error("Plain http:// is only allowed for localhost / private networks. Use https:// for public endpoints.");
  }
  return u;
}

/** Append a path to a base URL, preserving the original query string. */
function appendPath(baseRaw: string, ensureSuffix: string): string {
  const u = new URL(baseRaw);
  // Trim trailing slashes from path
  let path = u.pathname.replace(/\/+$/, "");
  if (!path.endsWith(ensureSuffix)) path += ensureSuffix;
  u.pathname = path;
  return u.toString();
}

/** Replace the trailing path segment (e.g. /chat/completions -> /models). */
function withFinalSegment(baseRaw: string, finalSegment: string): string {
  const u = new URL(baseRaw);
  let path = u.pathname.replace(/\/+$/, "");
  // Strip a trailing chat/completions, responses, or messages so we land on the API root.
  path = path.replace(/\/(chat\/completions|responses|messages)$/, "");
  if (!path.endsWith(finalSegment)) path += finalSegment;
  u.pathname = path;
  return u.toString();
}

/** Normalize a user-entered path fragment: ensures leading "/", trims trailing "/". */
function normalizePath(p: string | null | undefined): string {
  if (!p) return "";
  let s = String(p).trim();
  if (!s) return "";
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/+$/, "");
  return s;
}

/** Build a URL by joining base + prefix + suffix paths, preserving base's query string. */
function joinPath(baseRaw: string, ...segments: string[]): string {
  const u = new URL(baseRaw);
  let path = u.pathname.replace(/\/+$/, "");
  for (const seg of segments) {
    const n = normalizePath(seg);
    if (!n) continue;
    if (!path.endsWith(n)) path += n;
  }
  u.pathname = path || "/";
  return u.toString();
}

/**
 * Resolve a custom endpoint into a concrete URL + headers + kind + response_format.
 * Pass the raw values from the api_keys row.
 */
export function resolveCustomEndpoint(input: CustomEndpointInput): ResolvedEndpoint {
  const u = validateCustomUrl(input.base_url);
  const kind: ProviderKind = input.kind === "anthropic" ? "anthropic" : "openai_compatible";

  // Default response_format is derived from kind, but caller can override.
  const allowedFormats: ResponseFormat[] = ["chat_completions", "responses", "anthropic_messages"];
  let response_format: ResponseFormat = kind === "anthropic" ? "anthropic_messages" : "chat_completions";
  if (input.response_format && allowedFormats.includes(input.response_format)) {
    response_format = input.response_format;
  }

  // Default chat suffix from response_format.
  const defaultChatSuffix =
    response_format === "anthropic_messages" ? "/messages" :
    response_format === "responses" ? "/responses" :
    "/chat/completions";

  const prefix = normalizePath(input.path_prefix);
  const explicitChat = normalizePath(input.chat_path);
  const explicitModels = normalizePath(input.models_path);

  // Build chat URL: base + path_prefix + (chat_path || default suffix)
  const url = joinPath(u.toString(), prefix, explicitChat || defaultChatSuffix);

  // Models URL: explicit absolute > explicit path > base+prefix+models_path > derive from base
  let models_url: string;
  if (input.models_url) {
    models_url = validateCustomUrl(input.models_url).toString();
  } else if (explicitModels) {
    models_url = joinPath(u.toString(), prefix, explicitModels);
  } else if (prefix) {
    models_url = joinPath(u.toString(), prefix, "/models");
  } else {
    models_url = withFinalSegment(u.toString(), "/models");
  }

  const auth_scheme: AuthScheme = (["bearer", "header", "x-api-key", "query", "none"] as AuthScheme[])
    .includes(input.auth_scheme) ? input.auth_scheme : "bearer";

  // For query auth the auth_header field is repurposed as the param name (default "key").
  const defaultHeader = auth_scheme === "query" ? "key" : "Authorization";

  return {
    url,
    models_url,
    kind,
    extra_headers: sanitizeExtraHeaders(input.extra_headers),
    auth_scheme,
    auth_header: (input.auth_header || defaultHeader).trim(),
    response_format,
  };
}

/** Append `?name=value` (or `&`) to a URL, preserving existing query. */
function withQueryParam(raw: string, name: string, value: string): string {
  const u = new URL(raw);
  u.searchParams.set(name, value);
  return u.toString();
}

/**
 * Resolve forward URL + complete headers (including auth) for either built-in
 * or custom providers. `keyRow` is a row from api_keys.
 */
export function resolveEndpoint(keyRow: {
  provider: string;
  custom_base_url?: string | null;
  custom_models_url?: string | null;
  custom_kind?: string | null;
  custom_auth_scheme?: string | null;
  custom_auth_header?: string | null;
  custom_extra_headers?: Record<string, string> | null;
  custom_path_prefix?: string | null;
  custom_chat_path?: string | null;
  custom_models_path?: string | null;
  custom_response_format?: string | null;
}, upstreamKey: string | null): {
  url: string;
  models_url?: string;
  kind: ProviderKind;
  response_format: ResponseFormat;
  /** Headers ready to send (auth already applied where applicable). */
  headers: Record<string, string>;
  /** Optional rewriter to apply to the model id before forwarding. */
  normalize_model?: (id: string) => string;
} {
  if (keyRow.provider === "custom") {
    const r = resolveCustomEndpoint({
      base_url: keyRow.custom_base_url ?? "",
      models_url: keyRow.custom_models_url ?? null,
      kind: (keyRow.custom_kind as ProviderKind) ?? "openai_compatible",
      auth_scheme: (keyRow.custom_auth_scheme as AuthScheme) ?? "bearer",
      auth_header: keyRow.custom_auth_header ?? null,
      extra_headers: keyRow.custom_extra_headers ?? null,
      path_prefix: keyRow.custom_path_prefix ?? null,
      chat_path: keyRow.custom_chat_path ?? null,
      models_path: keyRow.custom_models_path ?? null,
      response_format: (keyRow.custom_response_format as ResponseFormat) ?? null,
    });
    const headers: Record<string, string> = { ...r.extra_headers };
    let url = r.url;
    let models_url = r.models_url;
    if (upstreamKey && r.auth_scheme !== "none") {
      if (r.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${upstreamKey}`;
      else if (r.auth_scheme === "x-api-key") headers["x-api-key"] = upstreamKey;
      else if (r.auth_scheme === "header") headers[r.auth_header] = upstreamKey;
      else if (r.auth_scheme === "query") {
        url = withQueryParam(url, r.auth_header, upstreamKey);
        models_url = withQueryParam(models_url, r.auth_header, upstreamKey);
      }
    }
    if (r.kind === "anthropic" && !headers["anthropic-version"]) {
      headers["anthropic-version"] = "2023-06-01";
    }
    return { url, models_url, kind: r.kind, response_format: r.response_format, headers };
  }

  const def = getProvider(keyRow.provider);
  if (!def) throw new Error(`Unknown provider: ${keyRow.provider}`);
  const headers: Record<string, string> = {};
  if (def.kind === "anthropic") {
    if (upstreamKey) headers["x-api-key"] = upstreamKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (upstreamKey) {
    headers["Authorization"] = `Bearer ${upstreamKey}`;
  }
  if (def.id === "openrouter") {
    headers["HTTP-Referer"] = "https://anveguard.app";
    headers["X-Title"] = "AnveGuard";
  }
  const response_format: ResponseFormat = def.kind === "anthropic" ? "anthropic_messages" : "chat_completions";
  return {
    url: def.url,
    models_url: def.models_url,
    kind: def.kind,
    response_format,
    headers,
    normalize_model: def.model_id_normalize,
  };
}
