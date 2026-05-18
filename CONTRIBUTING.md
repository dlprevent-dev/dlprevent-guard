# Contributing to AnveGuard

Thanks for taking the time to contribute. This document covers the workflow we use day to day.

> **Co-developed with Lovable AI?** AnveGuard is built in the Lovable editor + by
> external contributors via GitHub PRs. There's a sync gotcha worth knowing
> before your first PR — see [`docs/CONTRIBUTING-LOVABLE.md`](docs/CONTRIBUTING-LOVABLE.md)
> for the agreed workflow between Claude Code and Lovable AI on this repo.

## Setup

See [README.md](README.md#getting-started) for full setup. Short version:

```bash
npm ci
cp .env.example .env       # fill in real values
npm run dev
```

## Pre-commit checklist

Run all of these locally before pushing — CI runs them too, and a red CI check blocks merge:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For changes that touch edge functions:

```bash
cd supabase/functions
deno test --allow-env --allow-net --no-check
```

## Branch & commit style

- Branch from `main`. Name: `<type>/<short-slug>` (e.g. `fix/redos-timeout`, `feat/streaming-enforce`).
- Commits use [Conventional Commits](https://www.conventionalcommits.org/) prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`.
- Keep commits atomic — one logical change per commit.
- Reference the audit-plan issue ID where applicable (e.g. `fix(proxy): tighten CORS whitelist (H3)`).

## Pull request checklist

- [ ] CI is green
- [ ] New behavior has at least one test (unit or e2e)
- [ ] If you touched `supabase/functions/_shared/`, ensure Deno tests cover the change
- [ ] If you touched the database, the migration is forward-only and uses `IF NOT EXISTS` / `IF EXISTS` where idempotency matters
- [ ] If you touched the proxy auth path, document the change in `SECURITY.md`
- [ ] No new `any` types in `src/` (TypeScript strict is being enabled — don't make it worse)
- [ ] No new `console.log` left in production code paths
- [ ] No secrets committed (the CI `.env`-leak check should catch you, but check anyway)

## Code style

- Follow the patterns in the surrounding code.
- Prefer editing existing files to creating new ones.
- Keep files under 500 lines when possible — split into modules at natural boundaries.
- Use the existing UI primitives (`src/components/ui/*`) — don't add a second set.
- Use react-hook-form + zod for any new form. See `Endpoints.tsx` (`endpointFormSchema`) as a template.
- Tests live next to their target (`*.test.ts` / `*.test.tsx`) for unit tests; e2e in `e2e/`.

## Architecture decisions

Substantial design changes (new public API surface, schema changes, auth-path changes, new third-party integration) should be discussed in an issue before code lands. Smaller changes can go straight to PR.

The active hardening roadmap is in the audit plan — search for items by ID (C1-C5, H1-H11, M1-M11). Pick an unclaimed item and open a PR referencing the ID.

## Releasing

`main` is the deploy branch. The frontend is auto-built on push by the configured static host. Edge function and migration deploys are manual via Supabase CLI:

```bash
supabase functions deploy proxy dashboard
supabase db push
```

## Code of conduct

Be respectful. Disagree with ideas, not people. Assume good intent. If you see behavior that violates that standard, contact the maintainers.
