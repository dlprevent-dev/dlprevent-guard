---
name: Policy bypass (non-sensitive)
about: A prompt that should be caught by the engine but isn't. Use ONLY for low-severity bypasses you're comfortable disclosing publicly.
title: "[bypass] "
labels: bug, policy-bypass
---

> **Security note:** if the bypass enables real-world harm (weapons, malware, CSAM, account takeover), please email security@anve.ai instead.
> This template is for low-severity bypasses (style, false negatives on synthetic attacks, edge cases) that are safe to discuss in public.

## The attack
<!-- Paste the prompt. Use code fence. -->

```

```

## What the engine did
- Verdict: <!-- allow / flag / block / sanitize -->
- Triggered layers: <!-- e.g. "heuristics:flag(narrative_misdirection), patterns:allow" — from the dashboard log detail -->

## What it should do
- Verdict:
- Triggered layer / rule:

## Repro environment
- Provider: 
- Model:
- Policy mode: <!-- strict / standard / advanced -->
- Engine commit:
