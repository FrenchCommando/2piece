/**
 * Shared quadrature helpers for the K_1 bridge integral
 *   K_1(x) = ∫₀¹ (λ(1-λ))^{3/2} f(η(λ;x)) dλ ,  η = x·√(λ/(1-λ)).
 *
 * Single source of truth for the integrand and the three demonstration rules,
 * consumed by both the interactive Quadrature panel (`src/ui/quadrature.ts`)
 * and the static convergence figure (`src/figures/generate.ts`). Production
 * K_1 itself lives in `kernel.ts` (32-pt Gauss-Legendre); this module is the
 * comparison harness around it — see paper Appendix C.
 *
 * Gauss-Legendre and tanh-sinh apply to the full weighted integrand
 * `bridgeWeighted`; Gauss-Jacobi(3/2,3/2) absorbs the (λ(1-λ))^{3/2} weight
 * into its rule and applies to the bare `bridgeBare`.
 */

import { gaussLegendre } from "./gl";
import { gaussJacobi32 } from "./jacobi";
import { normCdf, normPdf } from "./normal";
import { tanhSinhRule } from "./tanhsinh";

export interface QuadRule {
	nodes: number[];
	weights: number[];
}

/** Truncated third moment factor f(η) = (η³+3η)Φ(η) + (η²+2)φ(η). */
export function fBridge(eta: number): number {
	return (eta ** 3 + 3 * eta) * normCdf(eta) + (2 + eta * eta) * normPdf(eta);
}

/** Brownian-bridge shift η(λ;x) = x·√(λ/(1-λ)). */
export function etaOfLambda(lambda: number, x: number): number {
	return x * Math.sqrt(lambda / (1 - lambda));
}

/**
 * Full weighted integrand — what Gauss-Legendre and tanh-sinh apply to.
 * Boundary collapse: a rule that saturates λ to exactly 0 or 1 hits
 * (λ(1-λ))^{3/2}·f(η) = 0·∞ = NaN; the limit is 0 there.
 */
export function bridgeWeighted(lambda: number, x: number): number {
	const m = lambda * (1 - lambda);
	if (m === 0) return 0;
	return m ** 1.5 * fBridge(etaOfLambda(lambda, x));
}

/** Bare integrand — what Gauss-Jacobi(3/2,3/2) applies to (weight is in the rule). */
export function bridgeBare(lambda: number, x: number): number {
	return fBridge(etaOfLambda(lambda, x));
}

/** Σ wᵢ·fn(λᵢ) for a rule on [0,1]. */
export function applyRule(r: QuadRule, fn: (lambda: number) => number): number {
	let acc = 0;
	for (let i = 0; i < r.nodes.length; i++) acc += r.weights[i] * fn(r.nodes[i]);
	return acc;
}

/** Plain Gauss-Legendre rule mapped from [-1,1] to [0,1]. */
export function gaussLegendre01(n: number): QuadRule {
	const gl = gaussLegendre(n);
	return {
		nodes: gl.nodes.map((u) => 0.5 * (u + 1)),
		weights: gl.weights.map((w) => 0.5 * w),
	};
}

/** tanh-sinh wants odd N; round up if even. */
export function tanhSinh01(n: number): QuadRule {
	return tanhSinhRule(n % 2 === 0 ? n + 1 : n);
}

/** Default node-count sweep for the convergence study (shared UI + figure). */
export const BRIDGE_CONV_NS = [4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];

export interface BridgeConvergence {
	ns: number[];
	/** |rule(n) − ref| for each rule, aligned with `ns`. */
	errGL: number[];
	errGJ: number[];
	errTS: number[];
}

/**
 * |error| vs node count at a fixed x, against a chosen reference value.
 * Reference is the closed form 3√(2π)/128 at x=0, or a high-order tanh-sinh
 * value away from ATM (caller's choice).
 */
export function bridgeConvergence(
	x: number,
	ref: number,
	ns: number[] = BRIDGE_CONV_NS,
): BridgeConvergence {
	const errGL: number[] = [];
	const errGJ: number[] = [];
	const errTS: number[] = [];
	for (const n of ns) {
		const vGL = applyRule(gaussLegendre01(n), (l) => bridgeWeighted(l, x));
		const vGJ = applyRule(gaussJacobi32(n), (l) => bridgeBare(l, x));
		const vTS = applyRule(tanhSinh01(n), (l) => bridgeWeighted(l, x));
		errGL.push(Math.abs(vGL - ref));
		errGJ.push(Math.abs(vGJ - ref));
		errTS.push(Math.abs(vTS - ref));
	}
	return { ns, errGL, errGJ, errTS };
}
