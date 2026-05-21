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

Direct technical predecessor: Costeanu–Pirjol 2011 (arXiv:1105.3359)
set up the Duhamel-perturbation framework for the analogous problem
one regularity class harsher — `C⁰` (jump in `σ'_loc`) in *normal*
IV, universal coefficient `(1/16)√(π/2) ≈ 0.0784`. After their
eq 5.25 they observe that their symmetric-model exact solution
contains only the `√T` non-analytic term (no `T^{3/2}, T^{5/2}, ...`)
and leave open whether that *absence* is a general feature of the
expansion or specific to their piecewise-linear model (verified
verbatim from arXiv:1105.3359v1 PDF, 2026-05-21). This project
settles it as model-specific: a `C²` knot (jump in `σ'''_loc = γ`,
the natural class of a piecewise-cubic calibrator) at the forward
produces a `T^{3/2}` non-analytic term in *log-normal Black* IV with
universal coefficient `3√(2π)/128 ≈ 0.0588`, filling the `T^{3/2}`
entry of CP Table 5.1 row n=1 via the same Duhamel framework adapted
to log-normal coords. The paper carries
two framings simultaneously: (i) **primary** — closes the
`C³`-regularity gap in PHL1 (BBF/PHL/GHLOW lineage, top-tier prior
art); (ii) **secondary but technically tight** — answers CP's §5.25
open question. See "Literature review (scoping)" for the full
positioning.

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
| concave | SPXW 2025-03-10 | 3 | 28.303289918533753 | -91.01397782800612 | -2448.8648048728382 | 2808.9138721582217 |

- Happy first knot (real): `k_p = +0.009370405484440836`,
  `Δγ = γ₊ − γ_centre = +368618.7394437184`.
- **Unhappy case** = happy cubic (DTE1 row) **+ `delta`·k³·H(k)** with the
  knot at k=0 and `delta = +368618.7394437184`.

Observed (sanity, matches CLAUDE.md narrative):
- Happy: BBF0 ~66 bps below PDE at the down-skew wing; PHL1 & GHLOW2 ~nail PDE.
- Concave: clean concave (frown) peak ≈ 28.5% near k≈-0.03; BBF0 ~43 bps off;
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

### Sanity check: same machinery reproduces Costeanu–Pirjol's C⁰ constant

The C⁰ case (source `δσ_loc(k) = Δb·k·H(k)`, jump in σ_loc' at ATM)
runs through the same Brownian-bridge framework with only two
substitutions: the truncated 3rd moment `f(η) = (η³+3η)Φ(η) +
(η²+2)φ(η)` becomes the truncated 1st moment `f₁(η) = η·Φ(η) + φ(η)`,
and the bridge weight `(λ(1-λ))^{3/2}` becomes `(λ(1-λ))^{1/2}` (one
factor of `√(λ(1-λ))` per `k` in the source). The C⁰ kernel at ATM is

```
Φ_BB^(1)(0,0) = ∫₀¹ √(λ(1-λ)) · f₁(0) dλ
             = (π/8) · (1/√(2π))
             = (1/8)·√(π/2) ≈ 0.15683
```

(`f₁(0) = φ(0) = 1/√(2π)`; `∫₀¹ √(λ(1-λ)) dλ = B(3/2,3/2) = π/8`.)

CP's published universal coefficient is `(1/16)·√(π/2) ≈ 0.07841` —
exactly half. The factor of 2 is the source-strength convention, not
a discrepancy: our `Δb` is the one-sided jump in `σ_loc'`, while CP's
`Δ(σ²_D)' = 2σ_D·Δ(σ_D)' = 2σ₀·Δb`. After the conversion the IV
corrections match to all digits:

```
δσ_BS(0) = Φ_BB^(1)(0,0) · Δb · σ_total
        = (1/8)·√(π/2) · Δb · σ_total
        ≡ (1/16)·√(π/2) · Δ(σ²_loc)' · √T          [via Δb = Δ(σ²_loc)'/(2σ₀)]
```

At F=1, σ_N ≈ σ_BS at ATM (CP eq A.7), so the same closed-form
constant `(1/16)·√(π/2)` recovers CP's normal-IV eq 5.8 result.

The reference number we matched against is CP's symmetric-model
**exact solution** (Appendix C of their paper, transcribed in
`theta-options/local_vol/costeanu_pirjol_2011.md` as the `σ₂(0,t)`
coefficient `σ₀·(1/2)·√(π/2)·b·√t`). That's the load-bearing
comparison — exact-solution numbers don't depend on the
perturbation-theory eq 5.8 at all — and it agrees with our derivation
above to all digits.

**Implication for the paper:** the Brownian-bridge framework is the
same Duhamel-perturbation object CP use; it just happens to give the
`C²`/log-normal answer `3√(2π)/128` when fed a `k³·H(k)` source
instead of a `k·H(k)` source. This is a *post-hoc* sanity check, not
part of the contribution — kept in NOTES, not in the paper. The C⁰
kernel is deliberately not added to `phibb.ts`: it has no production
use, and a 1-page derivation matching an exact-solution number to all
digits is verification enough without a code maintenance burden.

**Open structural choice: GHLOW2 + correction vs PHL1 + correction**
(2026-05-20). The T-ordering at the knot reads `T⁰`(BBF0), `T¹`(PHL1
σ_1·T), **`T^{3/2}`(this paper's knot correction)**, `T²`(GHLOW2
σ_2·T²). So *"PHL1 + correction"* is consistent at order `T^{3/2}`
but leaves `T²` (= GHLOW2's σ_2·T²) unmodeled; *"GHLOW2 + correction"*
captures one more order. The 2piece paper currently uses
PHL1+correction in Figure 3 (the knot figure) — chosen for narrative
focus ("close PHL1's C³ gap") rather than asymptotic completeness.
The upstream `theta-options/local_vol/NOTES_KNOT_CORRECTION.md`
notes that the *same* `Φ_BB` closed form works on top of GHLOW2
unchanged (their `GHLOW2rf` method) — and empirically beats
PHL1+correction at every tested DTE. So the natural one-line
extension of this paper would be to add GHLOW2+correction as a 5th
curve in Figure 3 (option A from the 2026-05-20 discussion); the
PHL1+correction headline stays. Deferred for now (scope). When
revisiting, the math is identical (same kernel, GHLOW2 baseline
instead of PHL1), and a single figure rerun is enough to land it.

**Why our answer is `T^{3/2}`, not `√T`** (Table 5.1 sanity check):
CP's Table 5.1 lists the *possible* powers of T at each perturbation
order n; which ones survive depends on the Taylor expansion of the
perturbation source `(σ²_D − σ²_0)/σ²_0` at u=0. For CP's `C⁰` case
the *linear* Taylor term `u·sign(u)` is non-zero and CP's eq 5.23
integral acts on it to give the surviving `√T` term. For our `C²`
case the perturbation source is `2σ_0·Δγ·k³·H(k)` — linear *and*
quadratic Taylor coefficients are zero, only the cubic is non-zero
(and sign-dependent via `H(k)`), so the first surviving entry from
Table 5.1 row n=1 is the `T^{3/2}` slot. Our `3√(2π)/128` is the
universal coefficient for that slot. (Asked once 2026-05-20; the
worry was that our paper might be claiming `√T` and thus
contradicting Table 5.1 — it isn't, both pieces are mutually
consistent and pick out adjacent entries of the same row.)

**Side observation (separate from the cross-check):** CP's published
eq 5.8 reads `σ_N = σ_D + (1/16)√(π/2)·σ_D·√T·Δ(σ²_D)'`. The extra
`σ_D` factor is **a typo in the original paper**, not in our upstream
transcription (`theta-options/local_vol/costeanu_pirjol_2011.md`
faithfully reproduces what's printed in CP). Three independent checks
confirm:
- **Dimensional.** `[σ_N]=[σ_D]=price/√time`, `[Δ(σ²_D)']=price/time`,
  so the formula must produce `[σ_N]=price/√time`. As printed it
  produces `(price/√time)·√time·(price/time) = price²/time`; without
  the extra `σ_D` it produces `√time·(price/time) = price/√time`.
- **Internal consistency with CP's own §5 claim.** CP state that
  eq 5.8 reproduces the `√T` term in eq 5.6 for the symmetric model
  (`Δσ'_D = 4b`, so `Δ(σ²_D)' = 2σ_0·Δσ'_D = 8σ_0·b`). Eq 5.8 as
  printed gives `(1/2)·√(π/2)·σ_0²·b·√T`; eq 5.6's leading √t
  coefficient is `σ_0·(1/2)·√(π/2)·b·√T`. Without the extra `σ_D`
  the two agree exactly.
- **Numerical (σ_0=0.008, b=0.1, the §4.1 example values).**
  Eq 5.6 leading √t coefficient: `5.01e-4`. Eq 5.8 as printed:
  `4.01e-6` (off by 125×). Eq 5.8 without the `σ_D`: `5.01e-4`
  (matches to printed precision).

Convention hypotheses (e.g., Bachelier vs Black) are ruled out by
the dimensional argument: CP work in normal/Bachelier throughout
(`dS = σ_D dW`, σ_N on LHS of eq 5.8), no convention can change the
units count without breaking the formula. The plausible origin of the
typo is a drafting artefact (a Black-IV analog formula carries a
`σ_BS` prefactor that doesn't survive the move to normal IV).

Corrected form: `σ_N = σ_D + (1/16)√(π/2)·√T·Δ(σ²_D)'`. Verified
against the original PDF 2026-05-20. No action needed in the upstream
notes — they are correctly transcribed; the error is CP's.

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
  paper/    2piece-paper.tex  refs.bib   (concise; simple ATM-knot derivation)
  2piece-paper.pdf  (tracked build output — see PDF note below)
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

## Literature review (scoping)

Scope reminder: the paper is narrowly about (i) the LV→IV asymptotic family
BBF / PHL1 / GHLOW and (ii) a closed-form first-order correction at an
ATM-pinned cubic knot. So "relevant" means "directly contextualises one of
those two pillars or the parametric-LV choice itself". Verdicts below say
whether each item earns a citation in the paper, just a mention in passing,
or no-cite.

### Already cited (paper currently uses)

- **Berestycki–Busca–Florent 2002**, *Quantitative Finance* 2(1):61–69 —
  leading-order time-homogeneous LV→IV map (BBF0, the inverse harmonic
  mean). The root of everything we do. **Cite — already in.**
- **Henry-Labordère 2008**, *Analysis, Geometry, and Modeling in Finance*,
  Chapman & Hall/CRC — heat-kernel derivation of the σ₁·T correction.
  PHL1 = this. **Cite — already in.**
- **Gatheral–Hsu–Laurence–Ouyang–Wang 2012**, *Math. Finance*
  22(4):591–620 (preprint 2009) — explicit closed-form for σ₁ and σ₂; we
  use the σ₁ formula verbatim and label it PHL1, and use the σ₂ formula
  for GHLOW2. **Cite — already in.**
- **De Marco 2021**, *SIAM J. Financial Math.* (preprint arXiv:2007.03585)
  — exact harmonic-mean representation of IV; pins down what the BBF
  leading order is approximating and what the next-order gap is. Direct
  background for the "BBF is leading order; what's the residual?"
  framing. **Cite — already in.**

### Direct technical predecessor (cite prominently)

- **Costeanu–Pirjol 2011**, arXiv:1105.3359 (JP Morgan) — the direct
  predecessor whose framework this paper extends. Same Duhamel
  perturbation of the call price against a constant-σ Black kernel
  (their eq 5.16 = our log-normal version line-for-line); same
  ATM-knot setup; their Table 5.1 enumerates the powers of T that
  arise from each perturbation order, which our `T^{3/2}` result
  fills (row n=1, the slot one column past their `√T`). They settle
  the `C⁰` case (jump in `σ'_loc`, *normal/Bachelier* IV) with
  universal coefficient `(1/16)√(π/2) ≈ 0.0784`. Their open question
  (after eq 5.25, verbatim from PDF) is **about the absence of
  higher non-analytic terms**, not about smoother regularities:
  "the explicit result for the normal implied volatility Eq.(5.6)
  for the model (5.1) contains only one non-analytic term √T, but
  not other terms of similar form, e.g. T^{3/2}, T^{5/2}, … . It
  would be interesting to investigate whether this is a general
  result, or if it holds only in the specific model (5.1)." This
  paper settles it as model-specific: in the `C²` class
  (jump in `σ'''_loc = γ`) at the forward, the `T^{3/2}` term
  *does* appear in *log-normal Black* IV with universal coefficient
  `3√(2π)/128 ≈ 0.0588`. **Framing decision (2026-05-20, revised):**
  two-layer framing. *Primary* anchor remains BBF/PHL/GHLOW lineage
  (top-tier asymptotic-LV literature) — this carries the paper's
  prestige weight; we extend PHL1 by closing its `C³`-regularity
  gap. *Secondary but technically tight* anchor is Costeanu–Pirjol:
  the connection is genuinely load-bearing (shared machinery, same
  table, answered open question, parallel universal coefficients),
  not a casual adjacency. So CP appears in abstract (no), intro
  (yes, one sentence), §Related Work (yes, full paragraph),
  conclusion (yes, one sentence). Earlier we briefly tried a softer
  "supporting parallel" framing with CP only in Related Work; that
  understated the connection once we had verified the typo, the
  cross-check, and the Table 5.1 slot-filling. **Cite — already in
  bib.** (Prior internal analysis lives in
  `theta-options/local_vol/costeanu_pirjol_2011.md` and
  `costeanu_pirjol_relevance.md`.)

### Add to bib + cite (foundational gap)

- **Dupire 1994**, *Risk* 7(1):18–20 — the forward PDE we use as ground
  truth. Currently uncited even though §2/Results call it the Dupire PDE.
  **Cite — add to bib.**
- **Hagan–Kumar–Lesniewski–Woodward 2002**, *Wilmott* Sep 84–108 —
  SABR: a stochastic-vol model with a leading-order singular-perturbation
  asymptotic for its IV in closed form. The canonical alternative
  "parametric model + asymptotic" combination, on the SV side rather
  than the LV side. **Cite — add to bib.**

### Add to bib + cite (alternatives to "parametric LV → IV map")

- **Gatheral 2004 (SVI)** — direct parametric form for the IV smile
  itself, not the local vol. The other side of the design choice the
  paper makes. **Cite — add to bib.**
- **Gatheral–Jacquier 2014**, *Quantitative Finance* 14(1):59–71 —
  arbitrage-free SVI / SSVI. Important contrast: SVI got "arbitrage
  reassurance" by constraining the IV-side parametrisation directly,
  whereas we get it by mapping LV→IV with a better-than-leading-order
  asymptotic. **Cite — add to bib.**
- **Andreasen–Huge 2011**, *Risk* Mar 86–89 — fits a piecewise-constant
  local vol in one implicit-Euler step of the Dupire PDE. Solves a
  *different* problem: "give me a fitted price surface that is
  FD-arbitrage-free by construction". Three reasons it doesn't subsume
  this paper: (i) piecewise-*constant* LV gives no smooth parametric
  gradients for an optimizer, (ii) FD-arbitrage-free is the discretised
  no-arbitrage of one implicit Euler step, not the continuous Dupire
  model's no-arbitrage (`O(ΔT)` scheme bias), (iii) no closed-form
  `σ_IV(k; θ)` — IV is only available by re-running the FD scheme.
  Still cited as the direct alternative on the LV side. **Cite — add
  to bib.**

### Add to bib + cite (modern alternative asymptotics)

- **Pagliarani–Pascucci 2012**, *Cent. Eur. J. Math.* 10(1):250–270 —
  adjoint-expansion-based density / price approximation in LV models.
  Modern alternative methodology to PHL/GHLOW heat-kernel expansion;
  one cite to acknowledge there are non-heat-kernel routes. **Cite —
  add to bib.**
- **Lorig–Pagliarani–Pascucci 2017**, *Math. Finance* 27(3):926–960
  (arXiv:1306.5447) — explicit IV expansions for LSV models from the
  adjoint-expansion machinery; the modern "closed-form IV expansion"
  toolkit. Does **not** subsume this paper: their main scheme is a
  Taylor expansion of the coefficients around a chosen expansion point
  with the explicit hypothesis `a_α(t,·) ∈ C^N(ℝ^d)`. A piecewise
  cubic with `Δγ ≠ 0` at the ATM knot has `σ_loc` only `C²` at `k=0`,
  i.e. the natural expansion point sits exactly where their hypothesis
  fails. (They mention a Hermite/L² variant for non-smooth coefficients
  but do not develop it, and L² is the wrong norm for a localised
  pointwise residual.) Cited as the strongest modern alternative on
  smooth LV, with the hypothesis-mismatch making explicit why it does
  not handle the knot case. **Cite — add to bib.**

### Add to bib + cite (wings / arbitrage framing)

- **Lee 2004**, *Math. Finance* 14(3):469–480 — moment formula for IV
  at extreme strikes: the universal asymptotic slope bound on the
  deep-wing IV smile of any arbitrage-free model, hence on every map
  in the family this paper works in. Cited as a one-line "the family
  is well-posed in the tails" anchor at the opposite end of the
  strike axis from the ATM contribution; not a claim that this paper
  says anything about wings. **Cite — add to bib.**
- **Roper 2010**, *preprint* (Univ. of Sydney) — clean statement of static
  no-arbitrage conditions on the IV surface (butterfly + calendar). The
  paper hinges on "PHL1 buys arbitrage reassurance over BBF0"; Roper is
  what "arbitrage" means there. **Cite — add to bib.**

### Mention if very short, otherwise skip

- **Berestycki–Busca–Florent 2004**, *Comm. Pure Appl. Math.* 57:1352–1373
  — SV (not LV) variant of the same heat-kernel approach. Methodological
  cousin to PHL/GHLOW but on a different model class. **Skip** in this
  paper (would dilute the LV focus); keep in upstream theta-options bib.
- **Foschi–Pagliarani–Pascucci** / **Pagliarani–Pascucci–Riga 2013**
  (Lévy adjoint expansion) — adds jumps to the adjoint-expansion story.
  Out of scope (pure diffusion here). **Skip.**

### Explicitly not relevant (decline)

- **Owen 1956 / Owen 1980 / Genz 2004** — bivariate-normal CDF
  evaluation. The broader upstream paper needs Φ₂ for the second-order
  K₂ kernel. The ATM-knot result here uses only Φ and φ, so this
  numerical lineage is genuinely orthogonal. **Skip.**
- **Heston / rough-vol family (Bayer–Friz–Gatheral 2016, Forde–Zhang,
  etc.)** — different model class (SV / fractional); no LV→IV map of
  the type studied. **Skip.**
- **Guyon path-dependent volatility 2014** — orthogonal direction
  (path-dependence, not knot regularity). **Skip.**

### How this lands in the paper (final structure)

A **Related Work** section between §1 Introduction and §2 Setup, 4
paragraphs:
1. **Direct prior art and open question** — Costeanu–Pirjol 2011
   (`C⁰` jump, normal IV, `(1/16)√(π/2)`); CP's open question (after
   eq 5.25) asks whether the absence of `T^{3/2}, T^{5/2}, ...` in
   their piecewise-linear model is general or model-specific. This
   paper settles it as model-specific by producing a `T^{3/2}` term
   for the `C²` case in log-normal Black IV with coefficient
   `3√(2π)/128`. Two-layer framing: PHL1 primary anchor (prestige),
   CP technical predecessor with the connection made explicit.
2. **Higher-order LV→IV asymptotics** — BBF → PHL1 → GHLOW lineage;
   Pagliarani–Pascucci / Lorig–Pagliarani–Pascucci as the modern
   adjoint-expansion alternative, with the `σ ∈ C^N` hypothesis
   mismatch that explains why their stronger general framework doesn't
   subsume the knot case; De Marco's harmonic-mean characterisation.
3. **Direct IV-side parametrisations** — SABR (Hagan et al), SVI /
   arbitrage-free SVI (Gatheral, Gatheral–Jacquier), Andreasen–Huge —
   the design choice the paper is implicitly defending; AH gets three
   distinguishing points (no parametric gradients; FD-no-arb ≠
   continuous-Dupire-no-arb; no closed-form smile).
4. **Static arbitrage and asymptotic constraints** — Roper (local
   no-arbitrage conditions giving meaning to "arbitrage reassurance")
   + Lee moment formula (universal asymptotic wing slope bound, sits
   at the opposite end of the strike axis from the contribution).

**Abstract** stays PHL1-anchored (no CP) — primary identity is the
`C³`-regularity gap closure. **Intro** gains one sentence noting the
contribution also answers CP's §5.25 open question for the `C²`
case. **§Related Work** (paragraph 1 above) carries the full
exposition — shared Duhamel framework, Table 5.1 slot-filling, both
universal coefficients side by side. **Conclusion** restates the
two-coefficient parallel as a one-sentence wrap. Net effect: CP
appears in three of four places (all except the abstract), framed as
the direct technical predecessor whose explicit open question this
paper answers.

## Status / log

- [x] Studied the upstream broad paper + its reference Python code
      (BBF0/PHL1/GHLOW2, the Dupire PDE, the Φ_BB kernel).
- [x] Calibrated SPXW examples, user-reviewed & approved (keep-for-now).
- [x] NOTES.md (this file).
- [x] examples/params.json
- [x] TS math port — cross-checked vs Python reference (`npm test`, 6/6:
      BBF0/PHL1/GHLOW2 1e-6, Φ_BB 1e-9, knot model vs PDE within tol).
- [x] Vite app + canvas charts (debounced inputs, 4 charts, presets).
- [x] TS figure script + committed SVGs (F1 happy 66.6bps, F2 concave
      42.8bps, F3 knot 229.6bps, F4 kernel peak 0.058749).
- [x] README (formulas + figures + run instructions).
- [x] LaTeX paper (`paper/2piece-paper.tex`, concise ATM-knot derivation) + refs.
- [x] GitHub Actions: `pages.yml` (test+figures-check+build+deploy),
      `paper.yml` (SVG→PDF via librsvg, pdflatex → `2piece-paper` artifact).
- [x] CLAUDE memory mirrored into `memory/` (repo self-contained).
- [x] Committed + force-pushed to GitHub (master, trailer-free, single
      commit; author = user only). Pages needs Settings→Source=GitHub
      Actions enabled once.

### Tracked PDF workflow (non-obvious — do not "fix")
`2piece-paper.pdf` is committed at the **repo root** on purpose. It is
build output, **not** generated locally or in-repo: the source of truth is
`paper/2piece-paper.tex`, and `paper.yml` builds the authoritative PDF as
the `2piece-paper` CI artifact. The user **manually** refreshes the tracked
copy by downloading that artifact after relevant paper changes.

Consequences, accepted by the user:
- The tracked PDF can lag `2piece-paper.tex` between manual refreshes
  (e.g. it will not show the Conclusion until the user re-downloads it).
- Do **not** add `*.pdf` to `.gitignore`, and do **not** `git rm` it — the
  user explicitly wants it tracked and self-refreshes it. (Asked twice.)

### Closed-form validity masking (deliberate — do not "fix")
The closed-form maps all divide by `σ_loc` (BBF0 = `k/∫₀ᵏ dy/σ_loc`, the
rest build on it), so they're only valid where `σ_loc > 0`. The strike band
is `±~3·σ_total` and `σ_total ∝ 1/√DTE`, so raising DTE widens the band;
with a steep negative `γ` the cubic crosses zero on a wing and the integrand
hits a pole (observed: happy preset, DTE≥4, right wing). `computeCurves`
walks outward from ATM and NaNs every closed-form point at/after the first
non-positive `σ_loc` (per side) — curves stop at the boundary instead of
spiking. PDE untouched (no `σ_loc` division); `σ_loc` panel still shows the
dive so the boundary is visible. Matches the "valid where vol > 0" framing.
`computeCurves` returns `kValid` (the surviving k-range); the smile/error/
correction charts default their x-domain to it so the axis trims to the
valid region when a wing is dropped (σ_loc panel stays full band — it's the
visual reason). DTE input is clamped to a positive integer in the UI; σ
(ATM vol — the denominator everywhere) is clamped to a small positive floor.

### Open / watch
- DTE input semantics: treated as **business days** (n_bdays=DTE). Documented
  in README. Calendar-vs-business is a known wrinkle inherited from the
  upstream calibration convention.
- TS port of the near-ATM polynomial paths (σ₁, σ₂) is the fiddly bit; plan a
  numeric cross-check script (TS vs Python) before wiring the UI.
