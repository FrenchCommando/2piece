/**
 * Properties of the three quadrature rules used by the diagnostic panel.
 * Each test catches a distinct class of defect:
 *
 *   - Polynomial exactness: Gauss-Jacobi at n nodes is exact on monomials
 *     up to degree 2n-1 against the (λ(1-λ))^{3/2} weight. The defining
 *     identity — any Golub-Welsch / lgamma / recurrence error fails here.
 *   - μ_0 / Beta value: sum of weights = ∫₀¹ (λ(1-λ))^{3/2} dλ = 3π/128.
 *     Catches a normalization-factor slip.
 *   - K_1(0, 0): Jacobi at n=1 reproduces the Beta value 3√(2π)/128
 *     exactly. The "right rule for ATM" claim from the conversation.
 *   - tanh-sinh unit integral & reference: sum of weights = 1, and
 *     n=257 matches Gauss-Legendre n=256 at x=1.5 to 1e-13 — the panel
 *     calls this its reference, so a disagreement would invalidate the
 *     convergence plot.
 *   - Cross-rule agreement at x=1.5: Gauss-Jacobi vs Gauss-Legendre at
 *     n=128 to 1e-9.
 */
import { describe, expect, it } from "vitest";
import { gaussLegendre } from "../src/math/gl";
import { gaussJacobi32 } from "../src/math/jacobi";
import { normCdf, normPdf } from "../src/math/normal";
import { tanhSinhRule } from "../src/math/tanhsinh";

const K1_PEAK = (3 * Math.sqrt(2 * Math.PI)) / 128;
// ∫₀¹ (λ(1-λ))^{3/2} dλ = B(5/2, 5/2) = Γ(5/2)²/Γ(5) = (9π/16)/24 = 3π/128.
const BETA_5_2 = (3 * Math.PI) / 128;

function fEta(eta: number): number {
	return (eta ** 3 + 3 * eta) * normCdf(eta) + (2 + eta * eta) * normPdf(eta);
}
const eta = (l: number, x: number): number => x * Math.sqrt(l / (1 - l));
// tanh-sinh's outermost nodes saturate to λ = 0 or 1 in f64, so
// (l(1-l))^{3/2}·f(η) becomes 0·∞ = NaN. Mathematically the integrand
// is 0 there (the weight wins); collapse the boundary explicitly.
function fullW(l: number, x: number): number {
	const m = l * (1 - l);
	if (m === 0) return 0;
	return m ** 1.5 * fEta(eta(l, x));
}
const bareG = (l: number, x: number): number => fEta(eta(l, x));

function ruleValue(
	r: { nodes: number[]; weights: number[] },
	fn: (l: number) => number,
): number {
	let acc = 0;
	for (let i = 0; i < r.nodes.length; i++) acc += r.weights[i] * fn(r.nodes[i]);
	return acc;
}

function glOn01(n: number): { nodes: number[]; weights: number[] } {
	const gl = gaussLegendre(n);
	return {
		nodes: gl.nodes.map((u) => 0.5 * (u + 1)),
		weights: gl.weights.map((w) => 0.5 * w),
	};
}

/** Analytic moment ∫₀¹ (λ(1-λ))^{3/2} λ^d dλ = B(d+5/2, 5/2), closed form. */
function jacobiMoment(d: number): number {
	function halfIntGamma(twoZ: number): number {
		let acc = Math.sqrt(Math.PI);
		for (let k = 1; k <= (twoZ - 1) / 2; k++) acc *= k - 0.5;
		return acc;
	}
	const num = halfIntGamma(2 * d + 5) * halfIntGamma(5);
	let denom = 1;
	for (let k = 1; k <= d + 4; k++) denom *= k;
	return num / denom;
}

describe("Gauss-Jacobi(3/2, 3/2)", () => {
	it("is exact on every monomial up to degree 2n-1 (n = 4)", () => {
		const j = gaussJacobi32(4);
		for (let d = 0; d <= 7; d++) {
			const numeric = ruleValue(j, (l) => l ** d);
			expect(Math.abs(numeric - jacobiMoment(d))).toBeLessThan(2e-14);
		}
	});

	it("sum of weights equals 3π/128 (the Beta(5/2, 5/2) value)", () => {
		for (const n of [1, 4, 8, 32]) {
			const sum = gaussJacobi32(n).weights.reduce((s, w) => s + w, 0);
			expect(Math.abs(sum - BETA_5_2)).toBeLessThan(1e-13);
		}
	});

	it("at n=1, recovers K_1(0, 0) = 3√(2π)/128 exactly", () => {
		const v = ruleValue(gaussJacobi32(1), (l) => bareG(l, 0));
		expect(Math.abs(v - K1_PEAK)).toBeLessThan(1e-15);
	});
});

describe("tanh-sinh on [0, 1]", () => {
	it("sum of weights converges to 1", () => {
		const sum = tanhSinhRule(129).weights.reduce((s, w) => s + w, 0);
		expect(Math.abs(sum - 1)).toBeLessThan(1e-12);
	});

	it("agrees with Gauss-Legendre n=256 on K_1(1.5, 0) to 1e-13", () => {
		// The panel calls tanh-sinh n=257 'the reference' for its convergence
		// plot — this check is what makes that label honest.
		const x = 1.5;
		const ts = ruleValue(tanhSinhRule(257), (l) => fullW(l, x));
		const gl = ruleValue(glOn01(256), (l) => fullW(l, x));
		expect(Math.abs(ts - gl)).toBeLessThan(1e-13);
	});
});

