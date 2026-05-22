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
- **Naming convention** (locked 2026-05-21): lowercase `c` suffix for
  "+correction" methods (PHL1c, GHLOW2c, GHLOW2cc — one `c` per
  closed-form correction layer); the bare `corr` abbreviation is
  forbidden because in finance it means correlation. Full rule +
  identifier table in [`memory/naming-convention.md`](memory/naming-convention.md).
- **Linter** (settled 2026-05-22): Biome with stock defaults
  (`biome.json` — tabs, double quotes, alphabetical imports). Both
  Biome rules `noNonNullAssertion` and `noExplicitAny` are on. The
  former is the load-bearing call: rather than suppress it, we added
  tiny throwing helpers in [`src/util.ts`](src/util.ts) (`byId`,
  `getContext2D`, `findOrThrow`, `mapGet`) so the same brevity at the
  call site gets a descriptive error when an invariant breaks instead
  of a downstream null deref. `noExplicitAny` is suppressed only at
  the three JSON-fixture indexing sites in `tests/reference.test.ts`
  with inline `biome-ignore` comments. `npm run lint` (CI) and
  `npm run lint:fix` (local).

## Example parameters

Provenance, the table of σ/β/α/γ values, the knot-case δ = 68619
rationale, and the sanity-observed bps numbers live in
[`memory/example-params.md`](memory/example-params.md) — that is the
single source of truth for the calibrated examples.

## The math (all in total-vol unless noted)

Notation: `scale = sqrt(252/n_bdays)*100` converts Black T=1 total vol →
annualised %. `n_bdays = max(1, DTE)` (business days; for this tool we treat
the DTE input as business days, n_bdays = DTE). `σ_total = σ_atm/scale` is the
unperturbed ATM total vol (the σ√T of the paper, with the codebase T=1
convention folded into `scale`).

**Kernel naming** (settled 2026-05-22): the bridge-integral kernel is
`K_1` — the *first-order Duhamel kernel* for the local-vol perturbation
against constant-σ Black, i.e. the first-order term of the Dyson series
for the perturbed call-price evolution. Renamed from `Φ_BB` because (i)
Φ collides with the standard-normal CDF that appears inside the kernel's
integrand, and (ii) "Brownian-bridge" is the integrand's *form* (after
the `λ=τ/T` rescaling), not the method — calling the kernel by the
bookkeeping rather than the load-bearing object misframes it. Paper-side
symbol `K_1` / `K_1^dir` / `K_1^ext`; TS code `K1` / `K1Dir` / `K1_PEAK`
in `src/math/kernel.ts`; CI fixture `tests/reference.json` uses matching
keys `K1_w0` / `K1` / `K1_dir`.

### Quick-reference table — methods, kernels, terms

| name | = | order in T at the knot | code field |
|---|---|---|---|
| **Methods** | | | |
| BBF0 | `k / ∫₀ᵏ dy/σ_loc(y)` (inverse harmonic mean) | `T⁰` | `bbf0` |
| PHL1 | BBF0 + σ₁·T | `T¹` | `phl1` |
| PHL1c | PHL1 + **universal kernel** | `T¹ + T^{3/2}` | `phl1c` |
| GHLOW2 | PHL1 + σ₂·T² | `T²` | `ghlow2` |
| GHLOW2c | GHLOW2 + **universal kernel** | `T² + T^{3/2}` | `ghlow2c` |
| GHLOW2cc | GHLOW2 + **extended kernel** | `T² + T^{3/2}` | `ghlow2cc` |
| **Kernels & terms** (scale by `δ·σ_total³` for ann %) | | | |
| universal kernel `K_1^dir` | `K_1(x,0) − x³/4·H(x) − x/4·H(x)` (eq:K1-dir) | — | `knotSpikePhl1` |
| extension (piece) | `−[σ₂(γ+δ) − σ₂(γ)]/(δ·σ_total³)·H(x)`, clipped to `[0, Δσ₂(0)]` | — | (inline in `knotSpikeGhlow2cc`) |
| extended kernel `K_1^ext` | universal kernel + extension (eq:ghlow2-dir) | — | `knotSpikeGhlow2cc` |

Suffix rule: one `c` per closed-form correction layer. **PHL1c** and
**GHLOW2c** each stack one (universal); **GHLOW2cc** stacks two
(universal + extension). The extension is one-sided (k > 0 only) by
construction — σ₂(k≤0) integrates over the unperturbed region; the
clip at the closed-form ATM scalar `|Δσ₂(0)| = |σ³·β·δ / (20·scale⁴)|`
is what makes the extension bounded without the w=0 trick that handled
the universal kernel.

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
First order (Δγ): `δσ_IV = Δγ · σ_total³ · K_1^dir(x, 0)`,
`x = k/σ_total`.

```
K_1(x,0) = ∫₀¹ (λ(1-λ))^{3/2} f(η) dλ ,  η = x·√(λ/(1-λ))
f(η) = (η³+3η)Φ(η) + (η²+2)φ(η)              [truncated 3rd moment]
peak K_1(0,0) = 3√(2π)/128 ≈ 0.05875
```
Subtract the PHL1 self-variation so it doesn't double-count (at w=0):
```
iv_hm_kernel(x,0) = x³/4   (x>0), 0 (x≤0)
σ₁_kernel(x,0)    = x/4     (x>0), 0 (x≤0)
K_1^dir(x,0) = K_1(x,0) − iv_hm_kernel − σ₁_kernel
```
This decays on both sides (the x³/4 of K_1 cancels iv_hm_kernel's leading
term). PHL1c = PHL1 + Δγ·σ_total³·K_1^dir(k/σ_total, 0), added on the
perturbed side only; left side (k≤0) untouched by construction (H(k)). Knot
envelope E=exp(-w²)=1 at w=0 (ATM) so it drops out — another reason the ATM
restriction is clean.

### Sanity check: same machinery reproduces Costeanu–Pirjol's C⁰ constant

The C⁰ case (source `δσ_loc(k) = Δb·k·H(k)`, jump in σ_loc' at ATM)
runs through the same Brownian-bridge framework with only two
substitutions: the truncated 3rd moment `f(η) = (η³+3η)Φ(η) +
(η²+2)φ(η)` becomes the truncated 1st moment `f₁(η) = η·Φ(η) + φ(η)`,
and the bridge weight `(λ(1-λ))^{3/2}` becomes `(λ(1-λ))^{1/2}` (one
factor of `√(λ(1-λ))` per `k` in the source). The C⁰ kernel at ATM is

```
K_1^(1)(0,0) = ∫₀¹ √(λ(1-λ)) · f₁(0) dλ
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
δσ_BS(0) = K_1^(1)(0,0) · Δb · σ_total
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
kernel is deliberately not added to `kernel.ts`: it has no production
use, and a 1-page derivation matching an exact-solution number to all
digits is verification enough without a code maintenance burden.

**Settled 2026-05-21 (final, evening).** Earlier the same day a single
"GHLOW2 + closed-form correction" method was added under the name
**GHLOW2c**, defined as GHLOW2 + K_1^dir + σ_2-δ-variation subtraction
(the formula now at paper eq:ghlow2-dir), and claimed to "remain bounded
for the same w=0 reason" as K_1 itself. Two things became visible:

1. The boundedness claim was wrong. `w=0` only kills the bridge
   integral's diverging polynomial (the `x³/4 + x/4` subtracted in the
   universal directed kernel). σ_2 itself has a `ξ³/(8·d⁵)` term with
   `d=O(1)` on the wings, so its δ-variation grows like `k³`. Scanned
   on the knot preset (`src/figures/asymptotic_scan.ts`): the extended
   kernel flipped sign around x≈1 and was 50× the universal kernel by
   x=5.
2. The single name "GHLOW2c" was overloading two construction steps
   (universal-kernel layer + σ_2-extension layer) into one method.

Two changes shipped:

- **Renamed and split.** New **GHLOW2c** = GHLOW2 + the universal
  K_1^dir only (equivalently PHL1c + σ_2·T). The previous GHLOW2c
  (universal + σ_2 extension) is renamed **GHLOW2cc**. Suffix rule
  promoted to convention: **number of `c`'s = number of closed-form
  correction layers**. Code field `ghlow2cc`; spike function renamed
  `knotSpikeGhlow2cc`. `memory/naming-convention.md` updated.
- **One-sided clip on the σ_2 piece.** Its raw value at k=0⁺ equals
  exactly the closed-form scalar `Δσ_2(0) = σ³·β·δ/(20·scale⁴)`
  (paper eq:ghlow2-gap). Clip the piece to the closed interval between
  `0` and that signed scalar: at k=0⁺ the clip is inactive (the value
  jump is closed exactly there), and on the wings the piece is forced
  to zero so the extended kernel collapses back to the universal one
  asymptotically. No diverging tail, no plateau.

Empirical (δ=68619, knot preset; `npx tsx src/figures/stats.ts`):
GHLOW2c 0.16 bps max error (universal-kernel-only; carries the
−0.171 bps σ_2 value jump at k=0); GHLOW2cc 0.15 bps max error
(extended kernel with clip; value-continuous at the knot to numerical
precision). GHLOW2cc therefore strictly improves on GHLOW2c — no
trade-off. `tests/reference.json` only fixtures PHL1c, so the rename
needed no fixture changes; the asymptotic_scan and stats scripts
under `src/figures/` are kept as permanent reporting utilities.

**F4 reworked.** Previously plotted (universal kernel) vs (full
extended kernel applied to GHLOW2). The two near-overlap, hiding the
σ_2 extension. F4 now plots (universal kernel) vs (extension piece
alone, = GHLOW2cc − GHLOW2c) so the small parametric bit is the
readable second curve.

**Terminology** (formally introduced in paper §"The at-the-money knot
correction" near eq:K1-dir; summary table at the top of
NOTES §"The math"):
- *universal kernel* `K_1^dir` — a pure x-function, used by PHL1c
  and GHLOW2c.
- *extension* / *extension piece* — the σ_2-only subtraction term
  alone, `(b,a,g)`-parametric, lives only on k>0, clipped.
- *extended kernel* `K_1^ext` — the whole object in
  eq:ghlow2-dir = universal + extension; used by GHLOW2cc.
"universal" / "extended" are my coinage, not literature standard;
introduced with a defining sentence after the user explicitly asked.

**Asymmetry FAQ** (came up: "why is the extension one-sided?"):
σ_2(k≤0) integrates the unperturbed cubic on `[k, 0]`, so the
perturbation `δ·k³·H(k)` never enters the integrand. The
asymptotic expansion (BBF0/PHL1/GHLOW2/K_1) sees the local-vol
surface only along the Varadhan-style geodesic from forward to
strike — for k<0 that geodesic lives in the unperturbed region.
Bridge fluctuations into the perturbed half-line contribute at
`O(exp(-c/T))`, non-perturbative; they sit below every polynomial-
in-T term in the expansion. The Dupire PDE captures the leakage;
the closed-form maps don't, by design.

**Still open.** Only remaining natural extension: w≠0 (off-ATM
knot), which loses the w=0 collapse on the bridge integral and is
genuinely harder.

**Load-bearing math kept in NOTES** (not in the paper):
the σ_2(0) closed-form derivation. σ_2(k) has the structure
`B(k)/k² + 3σ_1²/(2·iv_hm)` with `B = −3σ_1·iv_hm² + iv_hm⁵/8 +
(u_1/u_0)·iv_hm³`. Finiteness at k=0 forces `B(0)=0` (γ-free) and
`B'(0)=0` (γ cancels: σ_1'(0)|_γ contributes `−3·g·s⁴/4` to B'(0)
and (u_1/u_0)'(0)|_γ contributes `+3·g·s⁴/4`). The leading
γ-bearing piece is `B''(0)|_γ = s³·b·g/10`, giving
`σ_2(0)|_γ = s³·b·g/20` — exactly linear in γ. Replacing γ by γ+δ
gives Δσ_2(0) = `s³·b·δ_total/20 = σ³·β·δ/(20·scale⁴)` ann.%, which
is what eq:ghlow2-gap states.

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
universal coefficient for that slot. The paper's `T^{3/2}` and CP's
Table 5.1 are mutually consistent and pick out adjacent entries of
the same row.

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

Reference fixture: `tests/reference.json` is a frozen numerical fixture
covering BBF0/PHL1/GHLOW2, the Dupire PDE, and the K_1 kernel. The TS
math core in `src/math` must match it numerically — `npm test` enforces
this in CI on every push.

## Architecture

```
2piece/
  index.html, vite.config.ts, tsconfig*.json, package.json
  src/
    math/     bbf0 phl1 ghlow2 pde kernel cubic normal gl model .ts
    ui/       main.ts chart.ts style.css  (debounced inputs, 4 canvas charts)
    figures/  generate.ts svg.ts          (committed-SVG generator)
              stats.ts asymptotic_scan.ts (per-method bps + wing-asymptotic check)
    util.ts   (byId / getContext2D / findOrThrow / mapGet — throwing helpers
              for "I know this exists" lookups; see Decisions §Linter)
    env.d.ts
  biome.json  (linter config — stock defaults, see Decisions §Linter)
  examples/params.json
  tests/    reference.json + reference.test.ts (cross-check vs fixture)
  paper/    2piece-paper.tex  refs.bib   (concise; simple ATM-knot derivation)
  figures/  committed deterministic SVGs (README + paper share these)
  .github/workflows/  pages.yml  paper.yml
  README.md  NOTES.md  LICENSE  .gitignore
  memory/  (CLAUDE memory mirrored in — repo must be self-contained)
```

4 graphs (CLAUDE.md outline §Graphs):
1. Happy: smile + diff vs PDE — PDE/BBF0/PHL1/GHLOW2.
2. Concave example — same methods.
3. Unhappy fake knot at k=0 — PDE/BBF0/PHL1/PHL1c/GHLOW2/GHLOW2c/GHLOW2cc.
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

Rationale: a second Python implementation of K_1 / near-ATM polynomials /
the Dupire PDE would silently drift from the TS that actually runs. This is
the only intentional departure from the literal CLAUDE.md.

## Literature review (scoping)

Scope reminder: the paper is narrowly about (i) the LV→IV asymptotic family
BBF / PHL1 / GHLOW and (ii) a closed-form first-order correction at an
ATM-pinned cubic knot. So "relevant" means "directly contextualises one of
those two pillars or the parametric-LV choice itself". Verdicts below say
whether each item earns a citation in the paper, just a mention in passing,
or no-cite.

### Cited (BBF/PHL/GHLOW/DeMarco — foundational)

- **Berestycki–Busca–Florent 2002**, *Quantitative Finance* 2(1):61–69 —
  leading-order time-homogeneous LV→IV map (BBF0, the inverse harmonic
  mean). The root of everything we do. **Cited.**
- **Berestycki–Busca–Florent 2004**, *Comm. Pure Appl. Math.*
  57(10):1352–1373, DOI 10.1002/cpa.20039 — same authors extending
  the heat-kernel approach from LV to stochastic vol. Not load-bearing
  for the knot result, but cited in passing alongside BBF 2002 for
  author continuity (added 2026-05-21 on user push). **Cited.**
- **Henry-Labordère 2008**, *Analysis, Geometry, and Modeling in Finance*,
  Chapman & Hall/CRC — heat-kernel derivation of the σ₁·T correction.
  PHL1 = this. **Cited.**
- **Gatheral–Hsu–Laurence–Ouyang–Wang 2012**, *Math. Finance*
  22(4):591–620 (preprint 2009) — explicit closed-form for σ₁ and σ₂; we
  use the σ₁ formula verbatim and label it PHL1, and use the σ₂ formula
  for GHLOW2. **Cited.**
- **De Marco 2021**, *SIAM J. Financial Math.* (preprint arXiv:2007.03585)
  — exact harmonic-mean representation of IV; pins down what the BBF
  leading order is approximating and what the next-order gap is. Direct
  background for the "BBF is leading order; what's the residual?"
  framing. **Cited.**

### Cited (direct technical predecessor)

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
  `3√(2π)/128 ≈ 0.0588`. **Framing:** two-layer. *Primary* anchor is
  BBF/PHL/GHLOW lineage — paper extends PHL1 by closing its
  `C³`-regularity gap. *Secondary but technically tight* anchor is CP:
  shared Duhamel machinery, same Table 5.1, answered open question,
  parallel universal coefficients. CP appears in intro (one sentence),
  §Related Work (full paragraph), conclusion (one sentence); not in
  abstract. **Cited.** (Prior internal analysis lives
  in `theta-options/local_vol/costeanu_pirjol_2011.md` and
  `costeanu_pirjol_relevance.md`.)

### Cited (PDE ground truth + canonical SV alternative)

- **Dupire 1994**, *Risk* 7(1):18–20 — the forward PDE we use as ground
  truth. Currently uncited even though §2/Results call it the Dupire PDE.
  **Cited.**
- **Hagan–Kumar–Lesniewski–Woodward 2002**, *Wilmott* Sep 84–108 —
  SABR: a stochastic-vol model with a leading-order singular-perturbation
  asymptotic for its IV in closed form. The canonical alternative
  "parametric model + asymptotic" combination, on the SV side rather
  than the LV side. **Cited.**

### Cited (alternatives to "parametric LV → IV map")

- **Gatheral 2004 (SVI)** — direct parametric form for the IV smile
  itself, not the local vol. The other side of the design choice the
  paper makes. **Cited.**
- **Gatheral–Jacquier 2014**, *Quantitative Finance* 14(1):59–71 —
  arbitrage-free SVI / SSVI. Important contrast: SVI got "arbitrage
  reassurance" by constraining the IV-side parametrisation directly,
  whereas we get it by mapping LV→IV with a better-than-leading-order
  asymptotic. **Cited.**
- **Andreasen–Huge 2011**, *Risk* Mar 86–89 — fits a piecewise-constant
  local vol in one implicit-Euler step of the Dupire PDE. Solves a
  *different* problem: "give me a fitted price surface that is
  FD-arbitrage-free by construction". Three reasons it doesn't subsume
  this paper: (i) piecewise-*constant* LV gives no smooth parametric
  gradients for an optimizer, (ii) FD-arbitrage-free is the discretised
  no-arbitrage of one implicit Euler step, not the continuous Dupire
  model's no-arbitrage (`O(ΔT)` scheme bias), (iii) no closed-form
  `σ_IV(k; θ)` — IV is only available by re-running the FD scheme.
  Still cited as the direct alternative on the LV side. **Cited.**
- **Itkin–Lipton 2018**, *Journal of Computational Science*
  24:195–208, DOI 10.1016/j.jocs.2017.02.003 (preprint arXiv:1608.05145,
  2016) — sharpens the same family as AH: piecewise-*linear* local
  variance fit analytically via Laplace transform in time + Kummer
  hypergeometric functions in space (extends Lipton–Sepp 2011). Still
  has no closed-form `σ_IV(k; θ)`; still in the "fit LV to prices"
  design point rather than "asymptotic LV→IV with parametric LV".
  Cited alongside AH to round out that design family. Surfaced via
  2026-05-21 topic search. **Cited.**

### Cited (modern alternative asymptotics)

- **Pagliarani–Pascucci 2012**, *Cent. Eur. J. Math.* 10(1):250–270 —
  adjoint-expansion-based density / price approximation in LV models.
  Modern alternative methodology to PHL/GHLOW heat-kernel expansion;
  one cite to acknowledge there are non-heat-kernel routes. **Cited.**
- **Lorig–Pagliarani–Pascucci 2017**, *Math. Finance* 27(3):926–960
  (arXiv:1306.5447) — explicit IV expansions for LSV models from the
  adjoint-expansion machinery; the modern "closed-form IV expansion"
  toolkit. Cited as the parallel modern methodology in the LV→IV map
  space. Paper notes that their scheme Taylor-expands the coefficients
  about a point where the coefficients are assumed smooth, so the knot
  case here is non-smooth at the natural expansion point and lies
  outside that scope. (Internal context: their hypothesis is literally
  `a_α(t,·) ∈ C^N(ℝ^d)`; they mention a Hermite/L² variant for
  non-smooth coefficients but do not develop it. Not in the paper text
  to keep the framing soft — see 2026-05-21 LPP framing softening.)
  **Cited.**

### Cited (wings / arbitrage framing)

- **Lee 2004**, *Math. Finance* 14(3):469–480 — moment formula for IV
  at extreme strikes: the universal asymptotic slope bound on the
  deep-wing IV smile of any arbitrage-free model, hence on every map
  in the family this paper works in. Cited as a one-line "the family
  is well-posed in the tails" anchor at the opposite end of the
  strike axis from the ATM contribution; not a claim that this paper
  says anything about wings. **Cited.**
- **Roper 2010**, *preprint* (Univ. of Sydney) — clean statement of static
  no-arbitrage conditions on the IV surface (butterfly + calendar). The
  paper hinges on "PHL1 buys arbitrage reassurance over BBF0"; Roper is
  what "arbitrage" means there. **Cited.**

### Skipped (out of scope or wrong model class)

- **Foschi–Pagliarani–Pascucci** / **Pagliarani–Pascucci–Riga 2013**
  (Lévy adjoint expansion) — adds jumps to the adjoint-expansion story.
  Out of scope (pure diffusion here). **Skip.**
- **Owen 1956 / Owen 1980 / Genz 2004** — bivariate-normal CDF
  evaluation. The broader upstream paper needs Φ₂ for the second-order
  K₂ kernel. The ATM-knot result here uses only Φ and φ, so this
  numerical lineage is genuinely orthogonal. **Skip.**
- **Heston / rough-vol family (Bayer–Friz–Gatheral 2016, Forde–Zhang,
  etc.)** — different model class (SV / fractional); no LV→IV map of
  the type studied. **Skip.**
- **Guyon path-dependent volatility 2014** — orthogonal direction
  (path-dependence, not knot regularity). **Skip.**

### Searched 2026-05-21 and skipped (no preemption)

Active preemption-check search ran on this date across four angles:
CP 2011 forward citations (3 papers via Semantic Scholar — Belyaev
2023 HJM-LV swaptions, Burro et al 2017 negative-rates Bachelier
switch, Grunspan 2011 normal↔lognormal IV equivalence; all cite CP
for the Bachelier framework, not the regularity / asymptotic content,
none preempt); LPP 2017 forward citations (72 papers via the journal
DOI 10.1111/mafi.12105; all in LSV / SABR / Heston / multifactor /
adjoint-expansion lineage with smooth coefficients, none extend to
non-smooth coefficient regularity); author tracking (Pirjol now LSV /
VIX; Pascucci, Pagliarani now degenerate Kolmogorov / kinetic SDE; De
Marco now rough vol / VIX — none have done LV knot regularity work);
arXiv topic search. New candidates surfaced:
- **Paulot 2009/2015**, arXiv:0906.0658 — heat-kernel-based 2nd-order
  IV expansion for SV models, SABR application. Smooth-SV cousin of
  GHLOW2 on the SV side. Same "skip" rationale as BBF 2004. **Skip.**
- **Friz–Gassiat–Pigato 2018**, arXiv:1811.00267 (Ann. Appl. Proba.
  2021) — precise asymptotics for rough SV via regularity structures.
  Different model class + different methodology. **Skip.**
- **De March–Henry-Labordère 2019**, arXiv:1902.04456 — Sinkhorn-based
  arbitrage-free IV surface construction from bid-ask quotes. Different
  problem (numerical IV surface construction, not asymptotic LV→IV).
  **Skip.**
- **Pagliarani–Pascucci 2017**, *Finance & Stochastics* "The exact
  Taylor formula of the implied volatility" — refines LPP from `σ∈C^N`
  to *locally elliptic* (covers CEV/SABR degeneracy at S=0). Still
  smooth in space; doesn't touch knot regularity. The "closest near-
  miss" in the LPP lineage. **Skip.**
- **Karami–Shiraya 2018**, *J. Futures Markets* — normal IV under
  general LSV, applied to polynomial LV (smooth polynomial, not
  piecewise). **Skip.**

Net result: 0 preemptions. Confidence level for the C²-knot result
being original raised from "in-training pattern-completion suggests
yes" to "actively searched four angles, none found".

### Re-searched 2026-05-22 (corrected framing: alternative-methodology)

The 2026-05-21 pass was framed strictly as a *preemption check* — "did
anyone else publish this C²-knot correction first?" That filter
correctly returns "no" for methodologically-distinct papers that don't
claim a knot correction, but it also drops papers a reviewer would
expect us to position against. Re-ran with the prompt: "is there a
related-but-different methodology that solves the same root problem
(smoothness assumption breaking at C² knots) that a reader would
expect a comparison sentence for?" Also: walked
`theta-options\local_vol\*.md` — sibling-project paper-summary notes,
not searched in the prior pass.

Two new cites added:

- **Guyon–Henry-Labordère 2010** (SSRN 1663878) — the heat-kernel-
  expansion / quadrature alternative. Writes σ_BS² as a weighted
  space–time average of σ²_loc evaluated at quadrature points; C² knot
  handled by construction with no correction term. Trade-off: 2D
  quadrature per strike, no closed-form `σ_iv(k;θ)` for an optimiser
  to differentiate. Positioned as the "if you don't need closed form"
  alternative. Missed in the 2026-05-21 pass partly because of a
  name collision with "Guyon path-dependent volatility 2014" in the
  skip list — abbreviated "Guyon …" entries should be keyed by
  `author+year+topic` to disambiguate.
- **Medvedev–Scaillet 2007**, *RFS* 20(2):427–459 (earlier as NCCR
  FINRISK WP No. 275, January 2006) — the ODE-in-moneyness-degree
  alternative. Writes the IV PDE in θ = k/(σ√T), expands in √T,
  solves ODEs in θ at each order. Methodologically parallel to
  PHL/GHLOW heat-kernel; the polynomial-in-θ solution class breaks
  on the non-smooth forcing a C² knot injects — same smoothness-
  assumption pattern as LPP. Surfaced from sibling notes file
  `medvedev_scaillet_2006.md` (read for the first time today).

Considered-and-skip on this pass (no preemption, no reviewer-pushback
risk): Henry-Labordère 2005 HAL preprint (2008 book already cites the
σ₁ formula; Schrödinger framing isn't used here), Piterbarg Markovian
projection (wrong direction), Alòs/Malliavin (smooth-only), Reghai
conditional-distribution estimator (covered by guyonHenryLabordere2010
citation), six recent arXiv papers Jan 2025 → 2026-05-22 (Pirjol–Zhu
2024 IR-LV short-mat, Pirjol et al 2024 VIX/Asian/RV options, Cheng–
Cheng 2024 model-independent cumulant IV expansion, Yang et al 2025
LV-input denoising) — all smooth-coefficient or different problem.

Process lesson, generalised: when a project has a sibling notes /
research folder, related-work passes should `ls` that folder first.
Sibling notes are higher-signal than arXiv keyword searches because
the user has already triaged what they think matters. The
`theta-options\local_vol\*.md` folder was not consulted on
2026-05-21, which is why both new cites are findings from
re-reading the user's own filing cabinet rather than from web search.

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
   Pagliarani–Pascucci / Lorig–Pagliarani–Pascucci as the parallel
   adjoint-expansion methodology (paper notes their smoothness-at-
   expansion-point hypothesis and that the knot case lies outside that
   scope); Medvedev–Scaillet 2007 as the ODE-in-θ parallel route
   (polynomial-in-θ solution class broken by C²-knot forcing, same
   smoothness pattern); Guyon–Henry-Labordère 2010 as the quadrature
   alternative (handles knots by construction; trades closed-form
   `σ_iv(k;θ)` for a 2D quadrature per strike); De Marco's harmonic-
   mean characterisation.
3. **Direct IV-side parametrisations** — SABR (Hagan et al), SVI /
   arbitrage-free SVI (Gatheral, Gatheral–Jacquier), Andreasen–Huge,
   Itkin–Lipton — the design choice the paper is implicitly defending;
   AH gets three distinguishing points (no parametric gradients;
   FD-no-arb ≠ continuous-Dupire-no-arb; no closed-form smile); IL
   added as the analytical-fit refinement of AH (piecewise-linear LV
   via Laplace + Kummer).
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
      (BBF0/PHL1/GHLOW2, the Dupire PDE, the K_1 kernel).
- [x] Calibrated SPXW examples, user-reviewed & approved (keep-for-now).
- [x] NOTES.md (this file).
- [x] examples/params.json
- [x] TS math port — cross-checked vs Python reference (`npm test`, 6/6:
      BBF0/PHL1/GHLOW2 1e-6, K_1 1e-9, knot model vs PDE within tol).
- [x] Vite app + canvas charts (debounced inputs, 4 charts, presets).
- [x] TS figure script + committed SVGs (F1 happy 66.6bps, F2 concave
      42.8bps, F3 knot 66.6bps at δ=68619, F4 kernel peak 0.058749).
- [x] README (formulas + figures + run instructions).
- [x] LaTeX paper (`paper/2piece-paper.tex`, concise ATM-knot derivation) + refs.
- [x] GitHub Actions: `pages.yml` (test+figures-check+build+deploy),
      `paper.yml` (SVG→PDF via librsvg, pdflatex → `2piece-paper` artifact).
- [x] CLAUDE memory mirrored into `memory/` (repo self-contained).
- [x] Committed + force-pushed to GitHub (master, trailer-free, single
      commit; author = user only). Pages needs Settings→Source=GitHub
      Actions enabled once.
- [x] Active preemption-check search 2026-05-21 — verified CP §5.25
      wording against PDF; four-angle search (CP/LPP forward citations,
      author tracking, topic search) returned 0 preemptions of the
      C²-knot result. Itkin–Lipton 2018 added to bib. Search log in
      "Searched 2026-05-21 and skipped" subsection above.
- [x] Re-search 2026-05-22 with corrected (alternative-methodology)
      framing — added `guyonHenryLabordere2010` (HKE quadrature
      alternative) and `medvedevScaillet2007` (ODE-in-θ parallel
      route) to bib, plus matching positioning sentences in §Related
      Work paragraph 2 of the paper. Process lesson logged in
      "Re-searched 2026-05-22" subsection above.

### PDF distribution (non-obvious — do not re-track in repo)
The compiled PDF is **not** tracked in the repo. Source of truth is
`paper/2piece-paper.tex`; `paper.yml` builds it as the `2piece-paper`
CI artifact, and the user attaches that artifact to a **GitHub Release**
(see commit `46cbe27`, "attach paper to release"). Readers get the
PDF from the release page, not the repo tree.

Earlier the repo *did* track `2piece-paper.pdf` at the root with a
manual-refresh workflow; that has been retired (2026-05-21) in favour
of release attachments. Do **not** re-add the PDF to the repo or
revert `*.pdf` from `.gitignore` — the in-repo tracked PDF lagged the
`.tex` between refreshes and is no longer the distribution channel.

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
