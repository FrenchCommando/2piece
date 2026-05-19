---
name: stack-decisions
description: Locked architecture decisions for the 2piece repo
metadata: 
  node_type: memory
  type: project
  originSessionId: 95a346a1-a6c8-468c-bb21-50b6da0e265b
---

- Web stack: **vanilla TypeScript + Vite + hand-rolled canvas** (no
  React/MUI). Mirrors do-my-taxes build/deploy only. ~0 runtime deps.
- **Python was dropped** (user, 2026-05-19). Deviation from the literal
  CLAUDE.md: the validated TS math in `src/math` is the single source of
  truth; committed figures are deterministic SVGs from `npm run figures`
  (TS, via tsx). No venv. Rationale: avoid TS/Python numeric drift.

**Why:** the math (Φ_BB, near-ATM polynomials, Dupire PDE) is subtle;
duplicating it in a second language risks silent drift from what runs on the
site.
**How to apply:** keep all numerics in `src/math`; never reintroduce a
parallel Python implementation. The TS port is cross-checked against the
private theta-options Python reference via `tests/reference.json`
(committed, CI-run; theta-options itself stays private — see
[[theta-options-private]]). See [[example-params]].
