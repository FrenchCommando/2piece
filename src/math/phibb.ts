/**
 * Closed-form Brownian-bridge kernel Phi_BB for the ATM cubic-vol knot
 * correction. Port of the Python reference kernel + knot-spike routine,
 * specialised to a knot at k=0.
 *
 * Perturbation: delta_sigma_loc(k) = Delta_gamma * k^3 * H(k)  (knot at k=0).
 * First order: delta_sigma_IV(k) = Delta_gamma * sigma_total^3 *
 *   Phi_BB_directed(x, w),  x = k/sigma_total,  w = k_knot/sigma_total = 0.
 *
 *   Phi_BB(x,w)   = ∫_0^1 (λ(1-λ))^{3/2} f(η) dλ ,  32-pt Gauss-Legendre
 *   η(λ;x,w)      = [λx - (1-λ)w] / sqrt(λ(1-λ))
 *   f(η)          = (η^3+3η)Φ(η) + (2+η^2)φ(η)
 *   peak Phi_BB(0,0) = 3 sqrt(2π)/128 ≈ 0.05875
 *
 * Φ_BB_directed subtracts PHL1's own iv_hm/sigma_1 variation so it is not
 * double-counted (the x^3 growth cancels and the kernel decays both sides).
 */
import { gaussLegendre } from './gl';
import { normCdf, normPdf } from './normal';
import { sigma2 } from './ghlow2';
import type { CubicCoeffs } from './cubic';

export const PHI_BB_PEAK = (3 * Math.sqrt(2 * Math.PI)) / 128;

const N_QUAD = 32;

// Bridge-time nodes on [0,1] and the (λ(1-λ))^{3/2} weights, precomputed.
const gl = gaussLegendre(N_QUAD);
const LAM: number[] = gl.nodes.map((u) => 0.5 * (u + 1));
const QW: number[] = gl.weights.map((w) => 0.5 * w);
const BETA_NODE: number[] = LAM.map((l) => Math.sqrt(l * (1 - l)));
const BRIDGE_W: number[] = BETA_NODE.map((b) => b * b * b);

function fEta(eta: number): number {
  return (eta ** 3 + 3 * eta) * normCdf(eta) + (2 + eta * eta) * normPdf(eta);
}

/** Phi_BB(x, w): raw bridge kernel (right-side perturbation reference). */
export function phiBB(x: number, w: number): number {
  let acc = 0;
  for (let i = 0; i < N_QUAD; i++) {
    const lam = LAM[i];
    const eta = (lam * x - (1 - lam) * w) / BETA_NODE[i];
    acc += QW[i] * BRIDGE_W[i] * fEta(eta);
  }
  return acc;
}

function ivHmKernel(x: number, w: number): number {
  return x > 0 ? x ** 4 / (4 * (x + w)) : 0;
}

function sigma1Kernel(x: number, w: number): number {
  return x > 0 ? (x ** 3 * (x + 2 * w)) / (4 * (x + w) ** 3) : 0;
}

/** Direction-aware kernel delta_PDE_IV - delta_PHL1 (decays at large |x|). */
export function phiBBDirected(x: number, w: number): number {
  const signW = w >= 0 ? 1 : -1;
  const xd = signW * x;
  const wAbs = Math.abs(w);
  return phiBB(xd, wAbs) - ivHmKernel(xd, wAbs) - sigma1Kernel(xd, wAbs);
}

/**
 * PHL1 + ATM-knot correction spike, in annualised %. Knot fixed at k=0 so
 * w = 0 and the Gaussian far-knot envelope is exp(0) = 1.
 *
 * @param k            log-moneyness
 * @param delta        gamma discontinuity (Delta_gamma), annualised-% units
 * @param sigmaTotal   sigma_loc(0)/scale  (= sigma_knot at an ATM knot)
 */
export function knotSpikePhl1(k: number, delta: number, sigmaTotal: number): number {
  const x = k / sigmaTotal;
  return delta * sigmaTotal ** 3 * phiBBDirected(x, 0);
}

/**
 * GHLOW2-directed knot correction. The PHL1 directed kernel subtracts BBF0's
 * (x^3/4) and sigma_1's (x/4) delta-variations — universal in x. GHLOW2 has
 * one more delta-variation, sigma_2's, which carries the unperturbed cubic's
 * (b, a, g) parametrically and is not a universal x-function. For x > 0 we
 * subtract it explicitly so the directed kernel cancels GHLOW2's analytic
 * value jump at the knot; for x ≤ 0 the source perturbation does not move
 * the baseline at all and the PHL1-directed kernel is the right answer.
 *
 * Closed-form via existing `sigma2()` machinery: for the polynomial branch
 * (|k|<1e-3) the coefficients are explicit polynomials in (σ,β,α,γ,scale)
 * from `sigma2PolyCoeffsFromCubic`; we just difference the perturbed and
 * unperturbed cubic. At x=0 this evaluates to b/20 · δ·σ_total^3 ann.%, the
 * scalar derived in the paper.
 */
export function knotSpikeGhlow2(
  k: number,
  c: CubicCoeffs,
  delta: number,
  sigmaTotal: number,
  scale: number,
): number {
  const phl1Piece = knotSpikePhl1(k, delta, sigmaTotal);
  if (k <= 0 || delta === 0) return phl1Piece;
  const cPerturbed: CubicCoeffs = { ...c, gamma: c.gamma + delta };
  const sigma2VarPct = (sigma2(k, cPerturbed, scale) - sigma2(k, c, scale)) * scale;
  return phl1Piece - sigma2VarPct;
}
