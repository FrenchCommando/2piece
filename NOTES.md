# NOTES — project working log

> Per CLAUDE.md: take good notes here so a restart loses nothing.
> Audience: future-me / the user. Records the math, decisions, and status.

## What this project is

A focused note + interactive tool for **one question**: how accurate are the
standard local-vol → implied-vol approximations (BBF0, PHL1, GHLOW2), and how
a simple closed-form correction repairs PHL1 at a **single cubic-vol knot
placed exactly at-the-money (k=0)**.

This is the simple, observable subset of a broader (unfinished) upstream
study (provenance recorded in CLAUDE.md and the project memory, not here).
That broader study handles a general knot at arbitrary `w = k_knot/σ_total`;
restricting to the **ATM knot (w=0)** collapses the diverging-polynomial
hack and gives a clean closed form — that is the whole point of the
restriction.

## Deliverables (from CLAUDE.md)

1. Self-contained git repo (incl. all CLAUDE memory) → GitHub.
2. GitHub Pages interactive page, **all compute in-browser** (pattern from
   `~/do-my-taxes`: Vite build → `dist` → Pages via Actions).
3. README with the relevant formulas + descriptions.
4. GitHub Actions: (a) deploy Pages, (b) build the LaTeX paper PDF as an
   **artifact** (user has no LaTeX locally).
5. Python (local venv) scripts: one regenerates *all* README/paper graphs
   (matplotlib, PNGs committed), one takes custom inputs. Graphs committed so
   a cloner can diff.

## Decisions (locked with user)

- **Web stack:** Vanilla TypeScript + Vite + hand-rolled canvas plotting.
  No React/MUI. ~0 runtime deps. Mirrors do-my-taxes *build/deploy* only.
- **Example params:** calibrated from real SPXW market data (upstream
  calibration pipeline), user reviewed. Kept "for now, can change later".
- **Unhappy/knot case baseline:** **full happy cubic + Δγ jump at k=0**
  (realistic skew with the knot spike superimposed), not a flat-σ baseline.

## Example parameters (calibrated, baked into `examples/params.json`)

Units: σ,β,α,γ are coefficients of `1,k,k²,k³` in **annualised %**,
`k = log(K/F)`. Cubic: `σ_loc(k) = σ + β k + α k² + γ k³`.

| case | source | DTE | σ | β | α | γ |
|---|---|---|---|---|---|---|
| happy (skew) | SPXW 2025-03-10 | 1 | 31.12869431205608 | -104.84746098573555 | 3076.241202978902 | -45158.46287590234 |
| concave (half-circle) | SPXW 2025-03-10 | 3 | 28.303289918533753 | -91.01397782800612 | -2448.8648048728382 | 2808.9138721582217 |

- Happy first knot (real): `k_p = +0.009370405484440836`,
  `Δγ = γ₊ − γ_centre = +368618.7394437184`.
- **Unhappy case** = happy cubic (DTE1 row) **+ `delta`·k³·H(k)** with the
  knot at k=0 and `delta = +368618.7394437184`.

Observed (sanity, matches CLAUDE.md narrative):
- Happy: BBF0 ~66 bps below PDE at the down-skew wing; PHL1 & GHLOW2 ~nail PDE.
- Concave: clean half-circle frown peak ≈ 28.5% near k≈-0.03; BBF0 ~43 bps off;
  approximation valid where σ_loc > 0.

## The math (all in total-vol unless noted)

Notation: `scale = sqrt(252/n_bdays)*100` converts Black T=1 total vol →
annualised %. `n_bdays = max(1, DTE)` (business days; for this tool we treat
the DTE input as business days, n_bdays = DTE). `σ_total = σ_atm/scale` is the
unperturbed ATM total vol (the σ√T of the paper, with the codebase T=1
convention folded into `scale`).

### BBF0 — inverse harmonic mean (annualised %)

```
BBF0(k) = k / ∫₀ᵏ dy/σ_loc(y)        ;  BBF0(0) = σ_loc(0)   (L'Hôpital)
```
Gauss–Legendre (16 pt) on [0,k]. σ_loc in annualised %.

### PHL1 — BBF0 + σ₁·T  (Henry-Labordère)

`PHL1 = iv_hm + σ₁` in total vol (T folded into scale). With
`iv_hm = BBF0/scale`, `σ₀ = σ_atm/scale`, `σ_loc_t = σ_loc(k)/scale`:
```
σ₁(k) = iv_hm³/(2k²) · log1p( (σ₀·σ_loc_t − iv_hm²)/iv_hm² )
```
Near `|k| < 1e-3`: cancellation kills digits → evaluate the log1p argument
`P(k)/k²` analytically from the cubic via a reciprocal-cubic Taylor series
(`single_piece_log1p_arg` port). Output ×scale for annualised %.

### GHLOW2 — + σ₂·T²  (Gatheral–Hsu–Laurence–Ouyang–Wang 2009, eq 3.19)

`GHLOW2 = iv_hm + σ₁ + σ₂` (total vol). For `|k| ≥ 1e-3`, ξ=−k, d=ξ/iv_hm:
```
σ₂ = -3σ₁/d² + 3σ₁²/(2·iv_hm) + ξ³/(8d⁵) + ξ·(u₁/u₀)/d³
u₁/u₀ = [∫ (σ' + σ'' − ½(σ+σ')²/σ) dy] / [4 ∫ dy/σ]   (Yoshida, total vol)
```
integrals from min(k,0) to max(k,0), 16-pt GL. ATM limit
`u₁/u₀ → σ₀·f(0)/4`, `f = σ'+σ''−½(σ+σ')²/σ`. Near ATM σ₂ uses a polynomial
form (`sigma2_poly_coeffs_from_cubic` port).

### Dupire forward PDE (ground truth)

`∂C/∂T = ½ σ_loc(k)² (∂²C/∂k² − ∂C/∂k)` in log-moneyness, F=1, r=0.
Grid straddles 0, Dirichlet BCs (intrinsic left, 0 right), domain widened ×2.
Time-stepping: 2 backward-Euler (Rannacher) startup steps then Crank–Nicolson
(damps the payoff-kink oscillation that contaminates C''→IV near ATM).
IV via Newton inversion of undiscounted price (puts for k<0 via parity).

### The ATM-knot correction (the contribution)

Perturbation `δσ_loc(k) = Δγ·k³·H(k)` (knot at k_knot=0 ⇒ w=0).
First order (Δγ): `δσ_IV = Δγ · σ_total³ · Φ_BB^directed(x, 0)`,
`x = k/σ_total`.

```
Φ_BB(x,0) = ∫₀¹ (λ(1-λ))^{3/2} f(η) dλ ,  η = x·√(λ/(1-λ))
f(η) = (η³+3η)Φ(η) + (η²+2)φ(η)              [truncated 3rd moment]
peak Φ_BB(0,0) = 3√(2π)/128 ≈ 0.05875
```
Subtract the PHL1 self-variation so it doesn't double-count (at w=0):
```
iv_hm_kernel(x,0) = x³/4   (x>0), 0 (x≤0)
σ₁_kernel(x,0)    = x/4     (x>0), 0 (x≤0)
Φ_BB^directed(x,0) = Φ_BB(x,0) − iv_hm_kernel − σ₁_kernel
```
This decays on both sides (the x³/4 of Φ_BB cancels iv_hm_kernel's leading
term). PHL1+correction = PHL1 + Δγ·σ_total³·Φ_BB^directed(k/σ_total, 0),
added on the perturbed side only; left side (k≤0) untouched by construction
(H(k)). Knot envelope E=exp(-w²)=1 at w=0 (ATM) so it drops out — another
reason the ATM restriction is clean.

Reference impl: an independently-developed Python codebase covering
BBF0/PHL1/GHLOW2, the Dupire PDE solver, and the Φ_BB kernel (exact paths
in CLAUDE.md / project memory, deliberately not in this self-contained
repo). The TS port must match it numerically; `tests/reference.json` is the
frozen cross-check fixture dumped from it.

## Architecture

```
2piece/
  index.html, vite.config.ts, tsconfig*.json, package.json
  src/
    math/     bbf0 phl1 ghlow2 pde phibb cubic normal gl model .ts
    ui/       main.ts chart.ts style.css  (debounced inputs, 4 canvas charts)
    figures/  generate.ts svg.ts          (committed-SVG generator)
    env.d.ts
  examples/params.json
  tests/    reference.json + reference.test.ts (TS-vs-Python cross-check)
  paper/    main.tex  refs.bib   (concise; simple ATM-knot derivation)
  figures/  committed deterministic SVGs (README + paper share these)
  .github/workflows/  pages.yml  paper.yml
  README.md  NOTES.md  LICENSE  .gitignore
  memory/  (CLAUDE memory mirrored in — repo must be self-contained)
```

4 graphs (CLAUDE.md outline §Graphs):
1. Happy: smile + diff vs PDE — PDE/BBF0/PHL1/GHLOW2.
2. Concave example — same methods.
3. Unhappy fake knot at k=0 — PDE/BBF0/PHL1/PHL1+correction.
(The interactive page shows the knot-case set live driven by σ/β/α/γ/δ/DTE;
README/paper show 1–3 as static committed PNGs + the knot graph.)

## DEVIATION from CLAUDE.md — Python dropped (user-approved 2026-05-19)

CLAUDE.md asks for Python (matplotlib) graph scripts + a local venv. The user
asked "is python even needed if the core is in ts" and chose **drop Python,
generate figures from the TS core**. So:

- No `python/`, no venv, no requirements.txt.
- `src/math` (validated TS) is the single source of truth.
- `npm run figures` renders deterministic committed **SVGs** from the same
  math the site uses (`src/figures/generate.ts` + `svg.ts`).
- The one-off SPXW calibration that *did* need the upstream Python
  environment is already done; its outputs are baked into
  `examples/params.json` and `tests/reference.json`.

Rationale: a second Python implementation of Φ_BB / near-ATM polynomials /
the Dupire PDE would silently drift from the TS that actually runs. This is
the only intentional departure from the literal CLAUDE.md.

## Status / log

- [x] Studied broad paper + reference code (`single_cubic.py`, `pricers.py`,
      `phi_bb_kernel.py`, `paper/main.md`).
- [x] Calibrated SPXW examples, user-reviewed & approved (keep-for-now).
- [x] NOTES.md (this file).
- [x] examples/params.json
- [x] TS math port — cross-checked vs Python reference (`npm test`, 6/6:
      BBF0/PHL1/GHLOW2 1e-6, Φ_BB 1e-9, knot model vs PDE within tol).
- [x] Vite app + canvas charts (debounced inputs, 4 charts, presets).
- [x] TS figure script + committed SVGs (F1 happy 66.6bps, F2 concave
      42.8bps, F3 knot 229.6bps, F4 kernel peak 0.058749).
- [x] README (formulas + figures + run instructions).
- [x] LaTeX paper (`paper/main.tex`, concise ATM-knot derivation) + refs.
- [x] GitHub Actions: `pages.yml` (test+figures-check+build+deploy),
      `paper.yml` (SVG→PDF via librsvg, pdflatex → `paper-pdf` artifact).
- [x] CLAUDE memory mirrored into `memory/` (repo self-contained).
- [ ] Initial git commit + push to GitHub (remote not yet set).

### Open / watch
- DTE input semantics: treated as **business days** (n_bdays=DTE). Documented
  in README. Calendar-vs-business is a known wrinkle inherited from the
  upstream calibration convention.
- TS port of the near-ATM polynomial paths (σ₁, σ₂) is the fiddly bit; plan a
  numeric cross-check script (TS vs Python) before wiring the UI.
