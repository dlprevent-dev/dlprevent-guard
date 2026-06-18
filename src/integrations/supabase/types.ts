export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_subscriptions: {
        Row: {
          audit_action_filter: string[] | null
          cooldown_minutes: number
          created_at: string
          enabled: boolean
          fire_count: number
          id: string
          kind: string
          last_fired_at: string | null
          name: string
          target_url: string
          threshold_value: number | null
          threshold_window_minutes: number
          updated_at: string
          user_id: string
          webhook_secret: string | null
        }
        Insert: {
          audit_action_filter?: string[] | null
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          fire_count?: number
          id?: string
          kind: string
          last_fired_at?: string | null
          name: string
          target_url: string
          threshold_value?: number | null
          threshold_window_minutes?: number
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
        }
        Update: {
          audit_action_filter?: string[] | null
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          fire_count?: number
          id?: string
          kind?: string
          last_fired_at?: string | null
          name?: string
          target_url?: string
          threshold_value?: number | null
          threshold_window_minutes?: number
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      api_keys: {
        Row: {
          compression_mode: string
          created_at: string
          custom_auth_header: string | null
          custom_auth_scheme: string | null
          custom_base_url: string | null
          custom_chat_path: string | null
          custom_extra_headers: Json | null
          custom_kind: string | null
          custom_model_suggestions: string[] | null
          custom_models_path: string | null
          custom_models_url: string | null
          custom_path_prefix: string | null
          custom_response_format: string | null
          endpoint_id: string | null
          id: string
          is_active: boolean
          is_admin: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          model_default: string
          name: string
          provider: string
          provider_key_encrypted: string | null
          user_id: string
        }
        Insert: {
          compression_mode?: string
          created_at?: string
          custom_auth_header?: string | null
          custom_auth_scheme?: string | null
          custom_base_url?: string | null
          custom_chat_path?: string | null
          custom_extra_headers?: Json | null
          custom_kind?: string | null
          custom_model_suggestions?: string[] | null
          custom_models_path?: string | null
          custom_models_url?: string | null
          custom_path_prefix?: string | null
          custom_response_format?: string | null
          endpoint_id?: string | null
          id?: string
          is_active?: boolean
          is_admin?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          model_default?: string
          name: string
          provider: string
          provider_key_encrypted?: string | null
          user_id: string
        }
        Update: {
          compression_mode?: string
          created_at?: string
          custom_auth_header?: string | null
          custom_auth_scheme?: string | null
          custom_base_url?: string | null
          custom_chat_path?: string | null
          custom_extra_headers?: Json | null
          custom_kind?: string | null
          custom_model_suggestions?: string[] | null
          custom_models_path?: string | null
          custom_models_url?: string | null
          custom_path_prefix?: string | null
          custom_response_format?: string | null
          endpoint_id?: string | null
          id?: string
          is_active?: boolean
          is_admin?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          model_default?: string
          name?: string
          provider?: string
          provider_key_encrypted?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
          user_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
          user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      endpoint_shares: {
        Row: {
          created_at: string
          endpoint_id: string
          id: string
          owner_user_id: string
          permission: string
          shared_with_email: string
          shared_with_user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          id?: string
          owner_user_id: string
          permission?: string
          shared_with_email: string
          shared_with_user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          id?: string
          owner_user_id?: string
          permission?: string
          shared_with_email?: string
          shared_with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_shares_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoints: {
        Row: {
          auth_header: string | null
          auth_scheme: string
          base_url: string
          chat_path: string | null
          created_at: string
          default_model: string | null
          extra_headers: Json
          id: string
          kind: string
          model_suggestions: string[]
          models_path: string | null
          models_url: string | null
          name: string
          path_prefix: string | null
          provider_key_encrypted: string | null
          response_format: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_header?: string | null
          auth_scheme?: string
          base_url: string
          chat_path?: string | null
          created_at?: string
          default_model?: string | null
          extra_headers?: Json
          id?: string
          kind?: string
          model_suggestions?: string[]
          models_path?: string | null
          models_url?: string | null
          name: string
          path_prefix?: string | null
          provider_key_encrypted?: string | null
          response_format?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_header?: string | null
          auth_scheme?: string
          base_url?: string
          chat_path?: string | null
          created_at?: string
          default_model?: string | null
          extra_headers?: Json
          id?: string
          kind?: string
          model_suggestions?: string[]
          models_path?: string | null
          models_url?: string | null
          name?: string
          path_prefix?: string | null
          provider_key_encrypted?: string | null
          response_format?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      eval_results: {
        Row: {
          cost_usd: number | null
          created_at: string
          error_message: string | null
          grader_scores: Json
          id: string
          latency_ms: number
          passed: boolean
          request_log_id: string | null
          response_text: string | null
          run_id: string
          scenario_id: string | null
          scenario_name: string
          tokens_in: number
          tokens_out: number
          user_id: string
          verdict: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          grader_scores?: Json
          id?: string
          latency_ms?: number
          passed?: boolean
          request_log_id?: string | null
          response_text?: string | null
          run_id: string
          scenario_id?: string | null
          scenario_name: string
          tokens_in?: number
          tokens_out?: number
          user_id: string
          verdict?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          grader_scores?: Json
          id?: string
          latency_ms?: number
          passed?: boolean
          request_log_id?: string | null
          response_text?: string | null
          run_id?: string
          scenario_id?: string | null
          scenario_name?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eval_results_request_log_id_fkey"
            columns: ["request_log_id"]
            isOneToOne: false
            referencedRelation: "request_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "eval_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_results_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "eval_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      eval_runs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          suite_id: string
          summary: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          suite_id: string
          summary?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          suite_id?: string
          summary?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eval_runs_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "eval_suites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      eval_scenarios: {
        Row: {
          category: string
          context: Json | null
          created_at: string
          enabled: boolean
          expected: Json | null
          id: string
          name: string
          source: string
          suite_id: string | null
          turns: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          context?: Json | null
          created_at?: string
          enabled?: boolean
          expected?: Json | null
          id?: string
          name: string
          source?: string
          suite_id?: string | null
          turns?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          context?: Json | null
          created_at?: string
          enabled?: boolean
          expected?: Json | null
          id?: string
          name?: string
          source?: string
          suite_id?: string | null
          turns?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eval_scenarios_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "eval_suites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_scenarios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      eval_suites: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          endpoint_id: string | null
          grader_config: Json
          id: string
          model_alias: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          endpoint_id?: string | null
          grader_config?: Json
          id?: string
          model_alias?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          endpoint_id?: string | null
          grader_config?: Json
          id?: string
          model_alias?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eval_suites_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_suites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      key_behavior_profiles: {
        Row: {
          api_key_id: string
          encoded_ratio_mean: number
          prompt_len_m2: number
          prompt_len_mean: number
          sample_count: number
          top_models: Json
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          api_key_id: string
          encoded_ratio_mean?: number
          prompt_len_m2?: number
          prompt_len_mean?: number
          sample_count?: number
          top_models?: Json
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          api_key_id?: string
          encoded_ratio_mean?: number
          prompt_len_m2?: number
          prompt_len_mean?: number
          sample_count?: number
          top_models?: Json
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      known_intents: {
        Row: {
          created_at: string
          description: string | null
          examples: string[]
          id: string
          keywords: string[]
          label: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          examples?: string[]
          id?: string
          keywords?: string[]
          label?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          examples?: string[]
          id?: string
          keywords?: string[]
          label?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      model_aliases: {
        Row: {
          alias: string
          api_key_id: string
          created_at: string
          id: string
          target_endpoint_id: string | null
          target_model: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alias: string
          api_key_id: string
          created_at?: string
          id?: string
          target_endpoint_id?: string | null
          target_model: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alias?: string
          api_key_id?: string
          created_at?: string
          id?: string
          target_endpoint_id?: string | null
          target_model?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          allowed_keywords: string[]
          block_message: string
          blocked_keywords: string[]
          updated_at: string
          use_global_defaults: boolean
          user_id: string
        }
        Insert: {
          allowed_keywords?: string[]
          block_message?: string
          blocked_keywords?: string[]
          updated_at?: string
          use_global_defaults?: boolean
          user_id: string
        }
        Update: {
          allowed_keywords?: string[]
          block_message?: string
          blocked_keywords?: string[]
          updated_at?: string
          use_global_defaults?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      policy_intents: {
        Row: {
          action: string
          created_at: string
          id: string
          intent: string
          min_confidence: number
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          intent: string
          min_confidence?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          intent?: string
          min_confidence?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policy_rules: {
        Row: {
          applies_to_intents: string[]
          config: Json
          created_at: string
          direction: string
          enabled: boolean
          id: string
          kind: string
          name: string
          severity: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applies_to_intents?: string[]
          config?: Json
          created_at?: string
          direction?: string
          enabled?: boolean
          id?: string
          kind: string
          name: string
          severity?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applies_to_intents?: string[]
          config?: Json
          created_at?: string
          direction?: string
          enabled?: boolean
          id?: string
          kind?: string
          name?: string
          severity?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policy_settings: {
        Row: {
          allow_client_system_prompt: boolean
          audit_log_retention_days: number
          behavioral_action: string
          behavioral_churn_threshold: number
          behavioral_encoding_ratio_step: number
          behavioral_length_multiplier: number
          behavioral_persona_threshold: number
          classifier_action: string
          classifier_api_key: string | null
          classifier_endpoint_url: string | null
          classifier_shadow_mode: boolean
          classifier_threshold: number
          compression_level: string
          compression_min_chars: number
          created_at: string
          cross_tenant_action: string
          egress_action: string
          egress_block_private_ips: boolean
          egress_domain_allowlist: string[]
          egress_domain_denylist: string[]
          egress_scan_output_urls: boolean
          enable_behavioral: boolean
          enable_compression: boolean
          enable_cross_tenant_guard: boolean
          enable_deep_trace: boolean
          enable_egress_filter: boolean
          enable_evaluation: boolean
          enable_fuzzy_keywords: boolean
          enable_heuristics: boolean
          enable_injection_guard: boolean
          enable_intent: boolean
          enable_model_jailbreak_classifier: boolean
          enable_normalizer: boolean
          enable_patterns: boolean
          enable_pii_detection: boolean
          enable_semantic_keywords: boolean
          enable_tool_governance: boolean
          enable_trained_classifier: boolean
          guardrail_system_prompt: string | null
          injection_action: string
          intent_shadow_mode: boolean
          log_retention_days: number
          model_jailbreak_action: string
          model_jailbreak_shadow_mode: boolean
          model_jailbreak_threshold: number
          pii_action: string
          semantic_threshold: number
          severity_baseline_days: number
          severity_score_cap: number
          severity_volume_dampening: number
          strict_mode: boolean
          system_prompt_max_length: number
          throttle_flag_threshold: number
          throttle_window_minutes: number
          token_spike_alert_enabled: boolean
          token_spike_min_tokens: number
          token_spike_ratio: number
          token_spike_webhook_url: string | null
          token_spike_window_hours: number
          tool_allowlist: string[]
          tool_denylist: string[]
          tool_governance_action: string
          tool_governance_scan_response: boolean
          updated_at: string
          user_id: string
          workspace_purpose: string | null
        }
        Insert: {
          allow_client_system_prompt?: boolean
          audit_log_retention_days?: number
          behavioral_action?: string
          behavioral_churn_threshold?: number
          behavioral_encoding_ratio_step?: number
          behavioral_length_multiplier?: number
          behavioral_persona_threshold?: number
          classifier_action?: string
          classifier_api_key?: string | null
          classifier_endpoint_url?: string | null
          classifier_shadow_mode?: boolean
          classifier_threshold?: number
          compression_level?: string
          compression_min_chars?: number
          created_at?: string
          cross_tenant_action?: string
          egress_action?: string
          egress_block_private_ips?: boolean
          egress_domain_allowlist?: string[]
          egress_domain_denylist?: string[]
          egress_scan_output_urls?: boolean
          enable_behavioral?: boolean
          enable_compression?: boolean
          enable_cross_tenant_guard?: boolean
          enable_deep_trace?: boolean
          enable_egress_filter?: boolean
          enable_evaluation?: boolean
          enable_fuzzy_keywords?: boolean
          enable_heuristics?: boolean
          enable_injection_guard?: boolean
          enable_intent?: boolean
          enable_model_jailbreak_classifier?: boolean
          enable_normalizer?: boolean
          enable_patterns?: boolean
          enable_pii_detection?: boolean
          enable_semantic_keywords?: boolean
          enable_tool_governance?: boolean
          enable_trained_classifier?: boolean
          guardrail_system_prompt?: string | null
          injection_action?: string
          intent_shadow_mode?: boolean
          log_retention_days?: number
          model_jailbreak_action?: string
          model_jailbreak_shadow_mode?: boolean
          model_jailbreak_threshold?: number
          pii_action?: string
          semantic_threshold?: number
          severity_baseline_days?: number
          severity_score_cap?: number
          severity_volume_dampening?: number
          strict_mode?: boolean
          system_prompt_max_length?: number
          throttle_flag_threshold?: number
          throttle_window_minutes?: number
          token_spike_alert_enabled?: boolean
          token_spike_min_tokens?: number
          token_spike_ratio?: number
          token_spike_webhook_url?: string | null
          token_spike_window_hours?: number
          tool_allowlist?: string[]
          tool_denylist?: string[]
          tool_governance_action?: string
          tool_governance_scan_response?: boolean
          updated_at?: string
          user_id: string
          workspace_purpose?: string | null
        }
        Update: {
          allow_client_system_prompt?: boolean
          audit_log_retention_days?: number
          behavioral_action?: string
          behavioral_churn_threshold?: number
          behavioral_encoding_ratio_step?: number
          behavioral_length_multiplier?: number
          behavioral_persona_threshold?: number
          classifier_action?: string
          classifier_api_key?: string | null
          classifier_endpoint_url?: string | null
          classifier_shadow_mode?: boolean
          classifier_threshold?: number
          compression_level?: string
          compression_min_chars?: number
          created_at?: string
          cross_tenant_action?: string
          egress_action?: string
          egress_block_private_ips?: boolean
          egress_domain_allowlist?: string[]
          egress_domain_denylist?: string[]
          egress_scan_output_urls?: boolean
          enable_behavioral?: boolean
          enable_compression?: boolean
          enable_cross_tenant_guard?: boolean
          enable_deep_trace?: boolean
          enable_egress_filter?: boolean
          enable_evaluation?: boolean
          enable_fuzzy_keywords?: boolean
          enable_heuristics?: boolean
          enable_injection_guard?: boolean
          enable_intent?: boolean
          enable_model_jailbreak_classifier?: boolean
          enable_normalizer?: boolean
          enable_patterns?: boolean
          enable_pii_detection?: boolean
          enable_semantic_keywords?: boolean
          enable_tool_governance?: boolean
          enable_trained_classifier?: boolean
          guardrail_system_prompt?: string | null
          injection_action?: string
          intent_shadow_mode?: boolean
          log_retention_days?: number
          model_jailbreak_action?: string
          model_jailbreak_shadow_mode?: boolean
          model_jailbreak_threshold?: number
          pii_action?: string
          semantic_threshold?: number
          severity_baseline_days?: number
          severity_score_cap?: number
          severity_volume_dampening?: number
          strict_mode?: boolean
          system_prompt_max_length?: number
          throttle_flag_threshold?: number
          throttle_window_minutes?: number
          token_spike_alert_enabled?: boolean
          token_spike_min_tokens?: number
          token_spike_ratio?: number
          token_spike_webhook_url?: string | null
          token_spike_window_hours?: number
          tool_allowlist?: string[]
          tool_denylist?: string[]
          tool_governance_action?: string
          tool_governance_scan_response?: boolean
          updated_at?: string
          user_id?: string
          workspace_purpose?: string | null
        }
        Relationships: []
      }
      policy_template_versions: {
        Row: {
          applies_to_intents: string[]
          change_note: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          policy: Json
          rules: Json
          settings: Json
          template_id: string
          unknown_intent_fallback: string
          user_id: string
          version: number
        }
        Insert: {
          applies_to_intents?: string[]
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          policy?: Json
          rules?: Json
          settings?: Json
          template_id: string
          unknown_intent_fallback?: string
          user_id: string
          version: number
        }
        Update: {
          applies_to_intents?: string[]
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          policy?: Json
          rules?: Json
          settings?: Json
          template_id?: string
          unknown_intent_fallback?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "policy_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_templates: {
        Row: {
          applies_to_intents: string[]
          builtin_id: string | null
          created_at: string
          current_version: number
          description: string | null
          id: string
          name: string
          policy: Json
          rules: Json
          settings: Json
          unknown_intent_fallback: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applies_to_intents?: string[]
          builtin_id?: string | null
          created_at?: string
          current_version?: number
          description?: string | null
          id?: string
          name: string
          policy?: Json
          rules?: Json
          settings?: Json
          unknown_intent_fallback?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applies_to_intents?: string[]
          builtin_id?: string | null
          created_at?: string
          current_version?: number
          description?: string | null
          id?: string
          name?: string
          policy?: Json
          rules?: Json
          settings?: Json
          unknown_intent_fallback?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          clerk_user_id: string
          created_at: string
          email: string | null
          updated_at: string
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          email?: string | null
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          count: number
          expires_at: string
          key: string
          scope: string
          window_start: string
        }
        Insert: {
          count?: number
          expires_at?: string
          key: string
          scope: string
          window_start?: string
        }
        Update: {
          count?: number
          expires_at?: string
          key?: string
          scope?: string
          window_start?: string
        }
        Relationships: []
      }
      regression_tests: {
        Row: {
          created_at: string
          direction: string
          enabled: boolean
          expected_verdict: string
          id: string
          input: string
          last_run_at: string | null
          last_run_passed: boolean | null
          last_run_verdict: string | null
          name: string
          source_log_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          enabled?: boolean
          expected_verdict: string
          id?: string
          input: string
          last_run_at?: string | null
          last_run_passed?: boolean | null
          last_run_verdict?: string | null
          name: string
          source_log_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          enabled?: boolean
          expected_verdict?: string
          id?: string
          input?: string
          last_run_at?: string | null
          last_run_passed?: boolean | null
          last_run_verdict?: string | null
          name?: string
          source_log_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regression_tests_source_log_id_fkey"
            columns: ["source_log_id"]
            isOneToOne: false
            referencedRelation: "request_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regression_tests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      request_logs: {
        Row: {
          api_key_id: string | null
          block_reason: string | null
          client_system_prompt: string | null
          compression_applied: boolean
          created_at: string
          detected_intent: string | null
          egress_allowed: boolean | null
          egress_domain: string | null
          guardrail_prompt: string | null
          id: string
          intent_confidence: number | null
          latency_ms: number | null
          messages: Json | null
          model: string | null
          provider: string
          request_id: string | null
          response: Json | null
          response_tool_calls: string[] | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          tokens_saved_estimate: number | null
          tool_governance_verdict: string | null
          tools_names: string[] | null
          tools_requested: boolean | null
          upstream_latency_ms: number | null
          user_id: string
          verdict: string | null
          verdict_layers: Json | null
        }
        Insert: {
          api_key_id?: string | null
          block_reason?: string | null
          client_system_prompt?: string | null
          compression_applied?: boolean
          created_at?: string
          detected_intent?: string | null
          egress_allowed?: boolean | null
          egress_domain?: string | null
          guardrail_prompt?: string | null
          id?: string
          intent_confidence?: number | null
          latency_ms?: number | null
          messages?: Json | null
          model?: string | null
          provider: string
          request_id?: string | null
          response?: Json | null
          response_tool_calls?: string[] | null
          status: string
          tokens_in?: number | null
          tokens_out?: number | null
          tokens_saved_estimate?: number | null
          tool_governance_verdict?: string | null
          tools_names?: string[] | null
          tools_requested?: boolean | null
          upstream_latency_ms?: number | null
          user_id: string
          verdict?: string | null
          verdict_layers?: Json | null
        }
        Update: {
          api_key_id?: string | null
          block_reason?: string | null
          client_system_prompt?: string | null
          compression_applied?: boolean
          created_at?: string
          detected_intent?: string | null
          egress_allowed?: boolean | null
          egress_domain?: string | null
          guardrail_prompt?: string | null
          id?: string
          intent_confidence?: number | null
          latency_ms?: number | null
          messages?: Json | null
          model?: string | null
          provider?: string
          request_id?: string | null
          response?: Json | null
          response_tool_calls?: string[] | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tokens_saved_estimate?: number | null
          tool_governance_verdict?: string | null
          tools_names?: string[] | null
          tools_requested?: boolean | null
          upstream_latency_ms?: number | null
          user_id?: string
          verdict?: string | null
          verdict_layers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      route_steps: {
        Row: {
          created_at: string
          endpoint_id: string
          id: string
          model: string
          position: number
          route_id: string
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          id?: string
          model: string
          position: number
          route_id: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          id?: string
          model?: string
          position?: number
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_steps_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          description: string | null
          fallback_on_429: boolean
          fallback_on_5xx: boolean
          fallback_on_timeout: boolean
          id: string
          name: string
          timeout_ms: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fallback_on_429?: boolean
          fallback_on_5xx?: boolean
          fallback_on_timeout?: boolean
          id?: string
          name: string
          timeout_ms?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fallback_on_429?: boolean
          fallback_on_5xx?: boolean
          fallback_on_timeout?: boolean
          id?: string
          name?: string
          timeout_ms?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_secrets: {
        Row: {
          created_at: string
          name: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _lov_store_service_role_key: { Args: { _key: string }; Returns: string }
      claim_endpoint_shares: {
        Args: { _email: string; _user_id: string }
        Returns: number
      }
      increment_rate_limit: {
        Args: { _key: string; _scope: string; _window_seconds: number }
        Returns: {
          count: number
          window_start: string
        }[]
      }
      prune_all_logs: { Args: never; Returns: Json }
      prune_rate_limit_buckets: { Args: never; Returns: number }
      prune_user_logs: {
        Args: { _user_id: string }
        Returns: {
          audit_logs_deleted: number
          request_logs_deleted: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
