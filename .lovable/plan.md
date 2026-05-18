## Goal

Make it visually obvious that the Connect wizard supports both shapes — without adding a separate flow.

```
1:1   one provider  →  one AnveGuard key   (simple drop-in)
N:1   many providers →  one AnveGuard key  (unified gateway)
```

Both already work today (Step 2 is skippable). This is a UX/copy pass only.

## Changes

### 1. Step 1 → after "Create workspace"
Branch into two equally-weighted CTAs instead of forcing the user through Step 2:

```
[ Finish — use just <Provider> ]   [ Add more LLMs → ]
       (1:1, jumps to credentials)        (N:1, opens step 2)
```

Today only the second exists. The 1:1 path is buried behind clicking "Continue to credentials" on a step that says "Add more LLMs", which reads like a required step.

### 2. Step 2 header copy
Currently: "Connect more LLMs to this workspace" — implies required.
Change to: "Want a unified gateway? Attach more LLMs (optional)." + a "Skip — I only need one provider" ghost button at the top.

### 3. Step 0 tile grid intro
Add a single line above the grid:
> Pick a primary provider. You can attach more LLMs to the same AnveGuard key in the next step, or keep it 1:1.

### 4. Landing page Step 2 copy
Current Step 02 body talks about routing many models. Soften to acknowledge both modes:
> One ag_live_… key fronts your workspace — whether that's a single provider or a dozen. Apps pass `model="..."` and AnveGuard routes accordingly.

### 5. Keys page hint
Each key card already shows `endpoint_name` for 1:1 keys. Add an alias count badge ("+2 models") when aliases exist, so the difference between 1:1 and N:1 keys is visible at a glance.

## Out of scope
- No backend changes. No new tables. No new wizard step.
- Existing single-provider keys keep working unchanged.

## Files touched
- `src/pages/dashboard/Connect.tsx` — branch CTA at end of Step 1, header/skip on Step 2, intro line on Step 0
- `src/pages/Landing.tsx` — soften Step 02 copy
- `src/pages/dashboard/Keys.tsx` — alias-count badge on key cards (small addition)
