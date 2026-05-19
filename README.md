# Implied volatility at a cubic local-vol knot pinned at the money

A focused note + in-browser tool on one observable question: **how accurate
are the standard local-volatility → implied-volatility maps, and how does a
closed-form correction repair them at a cubic-vol knot placed exactly
at-the-money (k = 0)?**

- **Interactive page** (all computation in your browser):
  https://frenchcommando.github.io/2piece/
- **Research note** (PDF): built by GitHub Actions from
  `paper/2piece-paper.tex` (download the `2piece-paper` artifact from the
  latest *Build paper* run).

This is the simple, cleanly observable subset of a broader unfinished study:
the general case puts the knot at an arbitrary offset `w = k_knot/σ_total`,
which forces an unbounded-polynomial hack to keep the correction finite.
Pinning the knot to **k = 0 (w = 0)** removes that entirely and gives a clean
closed form — that is the whole reason for the restriction.

## The setup

Local volatility is a single cubic in log-moneyness `k = log(K/F)`, in
annualised %:

```
σ_loc(k) = σ + β·k + α·k² + γ·k³
```

A knot at the money adds a jump `δ` in the cubic coefficient on the call side
only (the `k ≤ 0` side is untouched):

```
σ_loc(k) = σ + β·k + α·k² + γ·k³ + δ·k³·H(k)        H = Heaviside
```

`σ_loc` stays C²-continuous at `k = 0`; only the third derivative jumps. This
is exactly what a piecewise-cubic vol calibrator produces, and it breaks the
smoothness assumption behind the standard asymptotic maps.

## The methods

Total vol uses the `T = 1` convention; `scale = √(252/n) · 100` converts
total vol ↔ annualised %, with `n = max(1, DTE)` business days and
`σ_total = σ/scale` the ATM total vol.

**BBF0** — leading-order inverse harmonic mean (Berestycki–Busca–Florent):

```
BBF0(k) = k / ∫₀ᵏ dy / σ_loc(y)            BBF0(0) = σ_loc(0)
```

**PHL1** — BBF0 + the first-order `σ₁·T` heat-kernel correction
(Henry-Labordère's heat-kernel expansion; we use the explicit per-strike
closed form of Gatheral–Hsu–Laurence–Ouyang–Wang, Thm. 2.4, and keep the
conventional label "PHL1"):

```
PHL1 = iv_hm + σ₁ ,
σ₁(k) = iv_hm³/(2k²) · log( √(σ_loc(0)·σ_loc(k)) / iv_hm )
```

(evaluated cancellation-free from the cubic coefficients near `|k| < 1e-3`).

**GHLOW2** — PHL1 + the Gatheral–Hsu–Laurence–Ouyang–Wang second-order
`σ₂·T²` term (their eq. 3.19, time-homogeneous, r = 0):

```
σ₂ = -3σ₁/d² + 3σ₁²/(2·iv_hm) + ξ³/(8d⁵) + ξ·(u₁/u₀)/d³ ,
ξ = -k ,  d = ξ/iv_hm ,  u₁/u₀ = Yoshida heat-kernel ratio
```

**Dupire PDE** — the ground truth. The forward equation in log-moneyness
(`F = 1`, `r = 0`)

```
∂C/∂T = ½ σ_loc(k)² (∂²C/∂k² − ∂C/∂k)
```

is solved with a Rannacher start (2 backward-Euler steps to damp the
payoff-kink) then Crank–Nicolson, Dirichlet boundaries on a widened domain.
Implied vol is recovered by inverting Black on the (out-of-the-money)
undiscounted price. At the deep wings the option's time value underflows and
the implied vol is genuinely unrecoverable — those points are dropped rather
than faked, so the curves end where the approximation is meaningful.

## The correction (the contribution)

To first order in the knot jump `δ`, the implied-vol error is a closed-form
Brownian-bridge integral. With `x = k/σ_total` and the knot at ATM (`w = 0`):

```
Φ_BB(x,0) = ∫₀¹ (λ(1−λ))^{3/2} f(η) dλ ,   η = x·√(λ/(1−λ))
f(η)      = (η³+3η)·Φ(η) + (η²+2)·φ(η)            (truncated 3rd moment)
peak Φ_BB(0,0) = 3√(2π)/128 ≈ 0.05875
```

PHL1 already absorbs part of this through its own `iv_hm`/`σ₁` variation;
subtracting that piece (so it is not double-counted) gives the *directed*
kernel, which decays on both sides:

```
Φ_BB^directed(x,0) = Φ_BB(x,0) − x³/4 − x/4      (x > 0; = Φ_BB otherwise)
```

The corrected method is then

```
PHL1+correction(k) = PHL1(k) + δ·σ_total³·Φ_BB^directed(k/σ_total, 0)
```

with PHL1 evaluated on the perturbed surface (so the cancellation is exact to
first order). The full derivation is in
[`paper/2piece-paper.tex`](paper/2piece-paper.tex).

## Figures

Happy case — calibrated SPXW 2025-03-10 DTE 1 (monotone skew, no knot). BBF0
sits ~67 bps off the PDE; PHL1 and GHLOW2 essentially nail it:

![Happy](figures/F1_happy.svg)

Concave case — calibrated SPXW 2025-03-10 DTE 3. The converted smile is a
half-circle; the approximation holds where vol is positive and the deep wings
are correctly trimmed:

![Concave](figures/F2_concave.svg)

Unhappy case — the happy cubic with a fake knot moved to k = 0. PHL1 alone is
biased near the knot; PHL1 + the Φ_BB correction recovers the PDE:

![Knot](figures/F3_knot.svg)

The applied correction in annualised % (the gap PHL1+corr adds to PHL1; it is
the dimensionless directed kernel, peak `3√(2π)/128`, scaled by `δ·σ_total³`):

![Correction](figures/F4_kernel.svg)

## Running locally

Requires Node (≥ 20). No Python, no venv.

```bash
npm install
npm run dev        # interactive page at http://localhost:5173
npm test           # cross-check the TS math against the reference fixture
npm run figures    # regenerate figures/*.svg ; `git diff` should be empty
npm run build      # production build into dist/ (what Pages serves)
```

The figures are deterministic: `npm run figures` then `git diff figures/`
should show no changes — that is how you confirm the committed images match
the code.

## How it is validated

`src/math` is the single source of truth. It is a 1:1 port of an
independently-developed, already-validated Python reference implementation.
`tests/reference.json` holds numbers dumped from that reference; `npm test`
checks the TS port reproduces them — BBF0/PHL1/GHLOW2 to 1e-6, Φ_BB to 1e-9,
and the full knot model against the Dupire PDE within tolerance. CI runs
this on every push.

## Layout

```
src/math/    bbf0 phl1 ghlow2 pde phibb cubic normal gl model   (the maths)
src/ui/      main controls chart                                 (the page)
src/figures/ generate svg                                        (committed figs)
examples/    params.json   (calibrated SPXW cases)
tests/       reference.json + cross-check against the Python reference
paper/       2piece-paper.tex refs.bib   (LaTeX note; PDF built in CI)
figures/     committed deterministic SVGs (README + paper share these)
memory/      project CLAUDE memory (repo is self-contained)
NOTES.md     working log: math, decisions, status
```

## Credits

Market data for the calibrated example smiles: **ThetaData**.

## License

MIT — Copyright (c) 2026 Martial Ren. See [`LICENSE`](LICENSE).
