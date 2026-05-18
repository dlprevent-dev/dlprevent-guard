<!-- Thanks for the PR. Run `npm run lint && npm run typecheck && npm test && npm run build` locally first — CI runs them too. -->

## What this changes
<!-- 1-3 sentences. Plain English. -->

## Why
<!-- The user-visible problem this fixes, or the audit-plan ID it closes (e.g. "closes C5 — no React error boundary"). -->

## How to verify
<!-- Concrete steps. Curl command, dashboard click path, or test command. -->

```

```

## Checklist

- [ ] CI is green (Frontend + Edge functions)
- [ ] New behavior has at least one test (Vitest, Deno, or Playwright)
- [ ] For engine changes: deno test passes in `supabase/functions/_shared/`
- [ ] No secrets committed
- [ ] If you touched the auth path, security model, or migration shape, `SECURITY.md` / `README.md` updated
- [ ] No new `any` types in `src/`
- [ ] No new `console.log` left in production code paths

## Risk assessment
<!-- One line. e.g. "Low — pure regex addition, FP-guarded by 2 tests." or "High — changes proxy auth path, needs careful review." -->
