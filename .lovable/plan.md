## Fix judge models + surface OpenRouter errors

Two small changes to `supabase/functions/eval/index.ts`:

**1. Update judge model slugs**
- Judge A: `google/gemini-3.1-flash-lite` (already correct, no change)
- Judge B: `z-ai/glm-4.6` → `z-ai/glm-5.2`

Also use these same slugs in `graderLlmJudge` calls during the run phase.

**2. Surface generation failures instead of swallowing them**
Right now `generate_plan_scenarios` wraps each OpenRouter call in `try/catch` and only `console.error`s. If both judge slugs fail (wrong model name, missing key, 402 credits, etc.) the plan ends with 0 scenarios and the UI just sits at "Generated 0 of N". I'll:
- Collect per-batch errors per judge.
- If a judge returns zero scenarios across all batches, include its last error message in the plan `summary.errors[judge]` and in the response payload.
- Step 3 wizard already shows an error pane — it'll now display "Judge B (glm-5.2): <error>" so you can see why nothing came back.

No DB changes, no frontend changes beyond what already renders `error`.

## Out of scope
- Adding a model-picker UI (slugs stay hard-coded for now).
- Retrying failed batches.