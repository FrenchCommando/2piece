---
name: example-params
description: Provenance and current values of the SPXW example parameters baked into examples/params.json (including the knot-case δ rationale)
metadata:
  node_type: memory
  type: project
  originSessionId: 95a346a1-a6c8-468c-bb21-50b6da0e265b
---

`examples/params.json` holds three cases. σ,β,α,γ,δ are coefficients of
`1,k,k²,k³` in **annualised %**, `k = log(K/F)`. Cubic:
`σ_loc(k) = σ + βk + αk² + γk³`. Calibrated from real SPXW via the
theta-options venv (`local_vol.pricers.calibrate_for_dte`), user-reviewed
2026-05-19 ("keep for now, can change later"). See
[[theta-options-private]] for why the calibrator is not in this repo.

| case | source | DTE | σ | β | α | γ |
|---|---|---|---|---|---|---|
| happy (skew) | SPXW 2025-03-10 | 1 | 31.12869431205608 | -104.84746098573555 | 3076.241202978902 | -45158.46287590234 |
| concave | SPXW 2025-03-10 | 3 | 28.303289918533753 | -91.01397782800612 | -2448.8648048728382 | 2808.9138721582217 |

- **Happy first knot (real):** `k_p = +0.009370405484440836`,
  `Δγ = γ₊ − γ_centre = +368618.7394437184` (from the same DTE1 fit).
- **Unhappy/knot case** = happy cubic (DTE1 row) **+ `δ·k³·H(k)`** with the
  knot at k=0 and **`δ = 68619`** (locked 2026-05-21 for chart legibility;
  the real Δγ from the SPXW calibration is +368618.74, but the artificial
  "move that knot to ATM" composition with unchanged magnitude makes the
  call-side σ_loc shoot up to ~100%+ and squashes the smile/error
  detail). The σ_2 value jump scales linearly with δ
  (`Δσ_2(0) = σ³·β·δ/(20·scale⁴)`) so the math story is preserved.

Sanity (matches CLAUDE.md narrative):
- Happy: BBF0 ~66 bps below PDE at the down-skew wing; PHL1 & GHLOW2 ~nail PDE.
- Concave: clean concave (frown) peak ≈28.5% near k≈-0.03; BBF0 ~43 bps off;
  approximation valid where σ_loc > 0.
- Knot (at δ=68619): F3 max|BBF0−PDE| = 66.6 bps (same as F1, since the
  knot's contribution no longer dominates the smooth-cubic gap); PHL1
  3.2 bps, PHL1c 2.0 bps, GHLOW2 3.1 bps, GHLOW2c 0.16 bps (universal
  kernel; visible −0.171 bps σ₂(0) value jump at k=0), GHLOW2cc 0.38
  bps (extended kernel closes the jump too). Re-derive with
  `npx tsx src/figures/stats.ts`.

**Why:** regenerating these needs theta-options + cached market data, not
in this repo.
**How to apply:** to re-pick, recalibrate via theta-options and re-bake
JSON + regenerate `tests/reference.json` and figures. To change δ,
just edit `examples/params.json` and `npm run figures` — every quantity
in the paper scales linearly with δ, so the closed-form formulas stay
valid. See [[project-overview]], [[stack-decisions]].
