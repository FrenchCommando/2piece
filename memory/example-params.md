---
name: example-params
description: Provenance of the calibrated SPXW example parameters
metadata: 
  node_type: memory
  type: project
  originSessionId: 95a346a1-a6c8-468c-bb21-50b6da0e265b
---

`examples/params.json` holds three cases. σ,β,α,γ,δ are coefficients of
1,k,k²,k³ in **annualised %**, k=log(K/F). Calibrated from real SPXW via the
theta-options venv (`local_vol.pricers.calibrate_for_dte`), user-reviewed
2026-05-19 ("keep for now, can change later").

- happy: SPXW 2025-03-10 DTE1 — σ=31.1287 β=-104.847 α=3076.24 γ=-45158.46
  (monotone skew; BBF0 ~66 bps off PDE).
- concave: SPXW 2025-03-10 DTE3 — σ=28.3033 β=-91.014 α=-2448.86 γ=2808.91
  (half-circle; ~43 bps; deep-wing IV unrecoverable → NaN, curve trims).
- knot (unhappy): happy cubic + δ=368618.7394437184 at k=0 (real first-knot
  Δγ=γ₊−γ_centre from the DTE1 fit, moved to ATM). User chose full happy
  cubic + jump (not flat-σ baseline).

**Why:** regenerating these needs theta-options + cached market data, not in
this repo. **How to apply:** to re-pick, recalibrate via theta-options and
re-bake JSON + regenerate `tests/reference.json` and figures. See
[[project-overview]].
