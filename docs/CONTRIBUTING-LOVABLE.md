# Contributing alongside Lovable AI

> AnveGuard is co-developed by Lovable AI (in-platform editor + bot commits) and
> external contributors (regular git PRs against `main`). The two contribution
> paths use **different branches** and **different deploy mechanisms**, which
> creates a sync gotcha worth knowing before your first PR.

This doc captures the workflow agreed with Lovable's AI assistant in May 2026.
If Lovable's behavior changes, please update this doc.

## Why this exists

The repo has two contribution loops that touch the same code:

| Contributor | How they push | Where it lands | Deploy trigger |
|---|---|---|---|
| **Lovable AI editor** | Saves in the lovable.dev UI auto-push as `lovable-dev[bot]` commits | Lovable session branch `edit/edt-<hash>` (auto-syncs to `main` as bot commits) | **Manual** `Publish → Update` button in the Lovable UI |
| **External contributors** | `git push` → PR → squash-merge | `main` directly | None automatic — needs Lovable owner to click `Publish → Update` |

**The gotcha:** When you (external contributor) merge a PR into `main`, Lovable's
**active editor session** does NOT automatically pull those commits into its
`edit/edt-<hash>` branch. The Lovable file tree stays behind, and the live deploy
at `guard.citerlabs.com` also stays behind (because the deploy runs from
Lovable's editor state, not from `main`).

The Lovable owner needs to manually merge `main` into the active edit branch
(or start a fresh session from `main`), THEN click `Publish → Update`.

## Workflow for external contributors (you)

### Before opening a PR

1. **Coordinate with the Lovable owner** — drop a quick "about to open a PR
   touching X" in chat / issue / wherever you coordinate.
   - If they have an active Lovable editing session on the same files, ask
     them to finish + sync before you push. This avoids merge conflicts.
2. **Branch from latest `main`:** `git fetch origin && git checkout -b
   feat/<your-thing> origin/main`
3. **Run all quality gates locally** (see `CONTRIBUTING.md`).

### Opening + merging the PR

1. Always use a PR + **squash merge**. No direct pushes to `main`.
2. Wait for CI green before merging.
3. **In the PR body, include a one-line "post-merge sync action for Lovable
   owner"** if your PR touches dashboard / proxy / shared files. Example:

   > **For Lovable owner after merge:** start a fresh Lovable session from
   > main, then click `Publish → Update`. This PR adds a new component the
   > current edit branch doesn't know about.

### After your PR merges

1. **Post the merge commit SHA + a one-line summary** in your coordination
   channel.
2. The Lovable owner takes the actions in the next section.
3. Verify the deploy refreshed: `curl -sSI https://guard.citerlabs.com/ |
   grep x-deployment-id` — the ID should change after `Publish → Update`.

## Workflow for the Lovable owner (project lead)

### Daily rhythm

1. **Before starting a Lovable editing session** — check GitHub `main` for
   new commits since you last had Lovable open. If there are any, start a
   fresh session from `main` (don't reopen the old one — it's stale).
2. **Keep Lovable sessions short-lived** — minutes to hours, not days.
   The longer a session lives, the more `main` drifts past it.
3. **One session = one logical change** — finish + push + sync + new
   session for the next thing.

### When an external PR merges while you have a Lovable session open

Ask yourself: **do I have important unsaved Lovable work in this session?**

**If NO:**
1. Close the Lovable editor tab.
2. Reopen the project at lovable.dev. This starts a fresh session from
   latest `main` — the external PR's changes are now in your editor.
3. Click `Publish → Update`. Wait 30-60s.
4. Verify: `curl -sSI https://guard.citerlabs.com/` — `x-deployment-id`
   should change.

**If YES (you want to preserve your in-progress Lovable work):**
1. In Lovable's chat, paste: `please merge origin/main into the current
   branch and confirm`.
2. Lovable will run the merge; resolve any conflicts it surfaces.
3. Verify the file tree now has the external contributor's new files.
4. Continue editing if needed.
5. When ready: click `Publish → Update` once.

### After a batch of external PRs

Multiple PRs can merge in a row. You don't need to publish after each one
— wait for the final state, then **click `Publish → Update` once**.

### Cleanup

- Don't rely on automatic garbage collection for `edit/edt-<hash>` branches.
- After a Lovable session's work has landed on `main` (via the bot's
  auto-push), abandon the session and optionally delete the stale branch
  in GitHub.

## Reference: branch naming

| Pattern | Owner | Lifetime |
|---|---|---|
| `main` | Both | Permanent — deploy target |
| `edit/edt-<hash>` | Lovable AI sessions | Short (hours-days) |
| `claude/<slug>` | Claude Code (external agent) | One PR |
| `feat/<slug>`, `fix/<slug>`, `chore/<slug>` | Other contributors | One PR |

## Reference: deploy facts

- **GitHub → Lovable editor:** auto-syncs for the **active branch only**.
  Push to `main` while Lovable is on `edit/edt-<hash>` → NOT auto-merged.
- **Lovable editor → live deploy:** requires manual `Publish → Update`
  click in the Lovable UI. There is no webhook to trigger this from
  outside Lovable.
- **Lovable → GitHub:** near-real-time via `lovable-dev[bot]` (formerly
  `gpt-engineer-app[bot]`) commits.
- **GitHub Actions CI:** runs on every PR and every push to `main`.
  Independent of the Lovable deploy.

## When to escalate to Lovable support

- After `Publish → Update`, the `x-deployment-id` doesn't change for >5
  minutes → infrastructure issue, file a ticket at support@lovable.dev
- GitHub sync into Lovable editor appears broken (the editor's file tree
  doesn't reflect `main` even after starting a fresh session) → file a
  ticket
- Frequent merge conflicts between `edit/edt-<hash>` and `main` → consider
  asking Lovable support if you can configure shorter session lifetimes or
  auto-merge

## See also

- `CONTRIBUTING.md` — general contributor workflow (lint, tests, commit
  style)
- `SECURITY.md` — responsible disclosure policy
- `CHANGELOG.md` — what's shipped, version by version
