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
export function knotSpike(k: number, delta: number, sigmaTotal: number): number {
  const x = k / sigmaTotal;
  return delta * sigmaTotal ** 3 * phiBBDirected(x, 0);
}
