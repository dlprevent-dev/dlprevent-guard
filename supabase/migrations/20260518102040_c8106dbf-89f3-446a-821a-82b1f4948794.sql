ALTER TABLE public.policy_templates ADD COLUMN IF NOT EXISTS builtin_id text;
CREATE UNIQUE INDEX IF NOT EXISTS policy_templates_user_builtin_unique
  ON public.policy_templates(user_id, builtin_id)
  WHERE builtin_id IS NOT NULL;