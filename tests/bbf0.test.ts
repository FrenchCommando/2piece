/**
 * BBF0 closed-form cross-check: the production implementation is now a
 * partial-fraction antiderivative (no quadrature), so reference.test.ts's
 * Python fixture only tells us "matches the existing Python at 1e-6". This
 * file is the *independent* check: compute the same integral via a
 * high-order Gauss-Legendre rule inside the test and compare to the
 * closed form. Tight tolerance — closed-form should match high-n GL to
 * floating-point noise.
 *
 * Also exercises the validity-masking branch: σ_loc crossing zero inside
 * [0, k] must return NaN, never a silent finite value.
 */
import { describe, expect, it } from "vitest";
import { bbf0 } from "../src/math/bbf0";
import { type CubicCoeffs, sigmaLoc } from "../src/math/cubic";
import { gaussLegendre } from "../src/math/gl";

const HAPPY: CubicCoeffs = {
	sigma: 31.12869431205608,
	beta: -104.84746098573555,
	alpha: 3076.241202978902,
	gamma: -45158.46287590234,
};
const CONCAVE: CubicCoeffs = {
	sigma: 28.303289918533753,
	beta: -91.01397782800612,
	alpha: -2448.8648048728382,
	gamma: 2808.9138721582217,
};

function bbf0HighNQuad(k: number, c: CubicCoeffs, n = 128): number {
	if (Math.abs(k) < 1e-15) return c.sigma;
	const { nodes, weights } = gaussLegendre(n);
	const half = 0.5 * k;
	let g = 0;
	for (let i = 0; i < n; i++) {
		g += weights[i] / sigmaLoc(half * nodes[i] + half, c);
	}
	return k / (half * g);
}

function rangeWithoutZero(lo: number, hi: number, step: number): number[] {
	const out: number[] = [];
	for (let k = lo; k <= hi + 1e-12; k += step) {
		if (Math.abs(k) > 1e-10) out.push(k);
	}
	return out;
}

describe("BBF0 closed form vs high-order quadrature", () => {
	it("matches Gauss-Legendre n=128 on the HAPPY cubic", () => {
		for (const k of rangeWithoutZero(-0.15, 0.15, 0.01)) {
			const analytic = bbf0(k, HAPPY);
			if (!Number.isFinite(analytic)) continue; // σ_loc crosses zero
			const quad = bbf0HighNQuad(k, HAPPY);
			expect(Math.abs(analytic - quad)).toBeLessThan(1e-9);
		}
	});

	it("matches Gauss-Legendre n=128 on the CONCAVE cubic", () => {
		for (const k of rangeWithoutZero(-0.15, 0.15, 0.01)) {
			const analytic = bbf0(k, CONCAVE);
			if (!Number.isFinite(analytic)) continue;
			const quad = bbf0HighNQuad(k, CONCAVE);
			expect(Math.abs(analytic - quad)).toBeLessThan(1e-9);
		}
	});
});

describe("BBF0 validity masking", () => {
	it("returns NaN when σ_loc crosses zero on (0, k)", () => {
		// σ_loc(y) = 0.5 − 10y has its root at y = 0.05, inside (0, 0.1).
		const linearVanishing: CubicCoeffs = {
			sigma: 0.5,
			beta: -10,
			alpha: 0,
			gamma: 0,
		};
		expect(bbf0(0.1, linearVanishing)).toBeNaN();
	});
});
