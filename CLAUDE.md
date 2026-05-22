Approximation for implied volatility for cubic local volatility with ATM knot


# Deliverables

self-contained git repo hosted on github (everything needs to be in there including all CLAUDE memory)

github-pages with relevant inputs and graphs, all computations done in browser - example in [do-my-taxes](https://github.com/FrenchCommando/do-my-taxes.git) (cloned in user folder)

readme containing relevant formulas and descriptions

github-actions to generate pdf from latex - will upload it to whatever relevant repo


# Logic

[paper](theta-options\paper) (in user folder too - references for papers are there too)

This is an unfinished paper - scope was too broad. We want this project to focus on a simpler subset: one knot at k=0.

Main reason is that the result is nicely observable and answers a real problem.


# Outline

## Context

Starting point is using BBF0 to convert between 'local volatility' and 'implied volatility'.
It is a standard to represent implied volatility with a parametric function on local volatility.
DeMarco uses this in his paper.

Main benefit of this approach:
- monotonicity and regularity on local volatility translates nicely on implied volatility
- this is a very important property to be able to use derivatives in optimizers

Main drawback:
- BBF0 is an approximation, so the corresponding implied volatility is not ensured to be arbitrage-free

## Dupire PDE

We use Dupire PDE to derive the implied volatility function from our local volatility function.
We only look at single maturity. We set the local volatility function to be constant in time, piecewise polynomial in space - which enables it to be parametric.
We will not explicitly review the convergence of the numerical method, the reasder can assume it's fully converged.

## Approximations

BBF0 is short maturity approximation. Additional components are given by PHL1 and GHLOW2.

BBF0 adds regularity which is nice.
PHL1 require C3 on local volatility to have C1 on implied volatility (which is not nice).

## Correction for ATM knot

This is the main contribution of this note. PHL1 works fine for cubic local volatility. However when the function is piecewise-cubic, the approximation becomes worse depending on how bad the (C3-)discontinuity is.
We are deriving the formula for the correction when the knot is exactly ATM. 
The formula for the general case is not discussed in this note: the equivalent is a diverging polynomial that would require a hack to keep the correction bounded.

### very simple derivation

Keep it short and concise.

## Graphs

### Happy case with no knots

no correction needed

one graph with smile + diff with PDE
- PDE
- BBF0
- PHL1
- GHLOW2

use a set of params derived from a typical SPXW 1DTE smile (do the real fit, convert to the relevant format, only report these numbers)


important features to point out
- BBF0 is quite far (~1%)
- each contribution improves the result

add another example where the converted smile leads to a concave smile

point out:
- the approximation still works in relevant area of the smile (where vol is positive)
- smile shape is half circle


### Unhappy case, fake knot at k=0

same idea for params: pull SPXW 1DTE, only keep ATM values, first knot, discontinuity - artificially move the discontinuity to k=0

- PDE
- BBF0
- PHL1
- PHL1c

[updated 2026-05-21: the shipped figure also includes GHLOW2, GHLOW2c (universal kernel on GHLOW2), and GHLOW2cc (extended kernel with σ_2 clip) — see NOTES.md for the timeline and the definitions table]

## Credits

ThetaData for contributing the data


# Code

python 3.14 with local venv

[updated 2026-05-19: Python dropped — the project ships as vanilla TypeScript + Vite, no Python runtime, no venv. The TS math core (`src/math/`) is the single source of truth and is cross-checked against the upstream Python reference in CI. See NOTES.md §"DEVIATION from CLAUDE.md".]

use [paper](theta-options\paper) with the corresponding venv to calibrate/select SPXW smiles and derive parameters to use in examples (store references and values in json) - we need to iterate on these so that the selected smiles are relevant.

[updated 2026-05-19: that one-off calibration is done; results are baked into `examples/params.json` (live values) and `tests/reference.json` (CI cross-check fixture). No further venv usage in this repo.]

the code in this repo should be able to generate all the graphs and support the interactive page. This means that we need to be able to run the PDE, and compute all the approximations.

## Entrypoints

The interactive page is the main tool that users to play with - nothing to install - generously hosted by github.

User who clone the repo and setup the venv should be able to run a script to generate (matplotlib) graphs.
One script to generate all the graphs that are referenced in the readme and final paper.
Another script to generate equivelent graphs with custom inputs.
All graphs are added to git for simplicity - user can confirm that the images are identical when running locally.

[updated 2026-05-19: shipped as `npx tsx src/figures/generate.ts` (deterministic SVGs from the TS core, committed to `figures/`) rather than matplotlib. `git diff figures/` after running confirms identical output. Custom-input graphs are served by the interactive page itself.]

github-actions to generate the research paper (also in git) - but the action generates it as an artifact, so that I don't have to have LaTeX installed


# Interactive page

(hosted on github-pages)

Needs to display the 4 graphs that are described in [outline#graphs].

Inputs are intuitive:
- (int) DTE: number of days to expiry (vols are annualised in all outputs)
- (float) sigma/beta/alpha/gamma: parameters for cubic function
- (float) delta: gamma discontinuity (k <= 0 is untouched, discontinuity is in k+)

Inputs are debounced, graphs are continuously regenerated. No need for a compute button.

All computation is done locally in browser (not server-side).


# Note for AI

I will ask you to read this and generate the contents.
Take notes in NOTES.md
If I am unhappy, I will delete everything and ask you to restart, so it's important that you take good notes.
