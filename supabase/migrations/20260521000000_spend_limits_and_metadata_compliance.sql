-- Step 1: Add compliance setting to policy_settings
ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_metadata_only_logs boolean NOT NULL DEFAULT false;

-- Step 2: Add spend limit and token budget tracking to api_keys
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS spend_limit_usd numeric(10, 4) NULL,
  ADD COLUMN IF NOT EXISTS current_spend_usd numeric(10, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS token_limit integer NULL,
  ADD COLUMN IF NOT EXISTS current_token_spend integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limit_window text NOT NULL DEFAULT 'infinite',
  ADD COLUMN IF NOT EXISTS limit_reset_at timestamptz NULL;

-- Step 3: Add constraint to limit_window to ensure strict validation
ALTER TABLE public.api_keys
  DROP CONSTRAINT IF EXISTS api_keys_limit_window_check;

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_limit_window_check
  CHECK (limit_window IN ('infinite', 'daily', 'monthly'));

-- Step 4: Add RPC function for atomic API key spend increments
CREATE OR REPLACE FUNCTION public.increment_api_key_spends(
  _key_id uuid,
  _cost numeric,
  _tokens integer
) RETURNS void AS $$
BEGIN
  UPDATE public.api_keys
  SET current_spend_usd = current_spend_usd + _cost,
      current_token_spend = current_token_spend + _tokens,
      last_used_at = now()
  WHERE id = _key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
