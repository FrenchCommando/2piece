/**
 * Centre cubic local vol and the polynomial helpers used by the near-ATM
 * (cancellation-safe) sigma_1 / sigma_2 paths. Single cubic piece anchored
 * at y=0, so no piece-switching machinery.
 *
 * sigma_loc(k) = sigma + beta*k + alpha*k^2 + gamma*k^3   (annualised %)
 */

export interface CubicCoeffs {
	sigma: number;
	beta: number;
	alpha: number;
	gamma: number;
}

export function sigmaLoc(k: number, c: CubicCoeffs): number {
	return c.sigma + c.beta * k + c.alpha * k * k + c.gamma * k * k * k;
}

/** Value and first two derivatives of the centre cubic. Annualised %. */
export function sigmaLocDerivs(
	k: number,
	c: CubicCoeffs,
): [number, number, number] {
	const s = sigmaLoc(k, c);
	const d1 = c.beta + 2 * c.alpha * k + 3 * c.gamma * k * k;
	const d2 = 2 * c.alpha + 6 * c.gamma * k;
	return [s, d1, d2];
}

// Each polyMultiply truncates to degree N_TERMS-1, so accuracy at the
// sigma_2 polynomial/full-formula crossover (|k| = 1e-3) compounds across
// nested products. N=5 gave a ~20-pt ghlow2 step at the threshold; N=8
// closes it to 5 decimals, N=10 leaves margin.
export const N_TERMS = 10;

/** Taylor coefficients c[0..n-1] of 1/(sigma + beta*t + alpha*t^2 + gamma*t^3). */
export function reciprocalCubicTaylor(
	sigma: number,
	beta: number,
	alpha: number,
	gamma: number,
	n: number,
): number[] {
	const q = new Array<number>(n + 1).fill(0);
	q[1] = beta / sigma;
	q[2] = alpha / sigma;
	q[3] = gamma / sigma;
	const c = new Array<number>(n).fill(0);
	c[0] = 1;
	for (let i = 1; i < n; i++) {
		let s = 0;
		for (let j = 1; j <= Math.min(i, 3); j++) s += q[j] * c[i - j];
		c[i] = -s;
	}
	return c.map((v) => v / sigma);
}

/** Multiply two polynomials, keeping terms up to degree n-1. */
export function polyMultiply(a: number[], b: number[], n: number): number[] {
	const r = new Array<number>(n).fill(0);
	const na = Math.min(a.length, n);
	const nb = Math.min(b.length, n);
	for (let i = 0; i < na; i++) {
		for (let j = 0; j < nb; j++) {
			if (i + j < n) r[i + j] += a[i] * b[j];
		}
	}
	return r;
}

/** Reciprocal of a power series h (h[0] != 0): coefficients w with h*w = 1. */
export function reciprocalSeries(h: number[], n: number): number[] {
	const w = new Array<number>(n).fill(0);
	const invH0 = 1 / h[0];
	w[0] = invH0;
	for (let i = 1; i < n; i++) {
		let s = 0;
		for (let j = 1; j <= i; j++) if (j < n) s += h[j] * w[i - j];
		w[i] = -s * invH0;
	}
	return w;
}

/** Horner evaluation of sum_i coeffs[i]*k^i. */
function horner(coeffs: number[], k: number): number {
	let v = 0;
	for (let i = coeffs.length - 1; i >= 0; i--) v = v * k + coeffs[i];
	return v;
}

/**
 * (sigma_0*sigma_loc(k)*(G(k)/k)^2 - 1)/k^2 for the centre cubic, anchored at
 * y=0 (so the constant and linear terms cancel analytically — no float
 * cancellation). Port of `single_piece_log1p_arg` with anchor=0.
 */
export function singlePieceLog1pArg(
	k: number,
	c: CubicCoeffs,
	n: number,
): number {
	const s0 = c.sigma;
	const recip = reciprocalCubicTaylor(s0, c.beta, c.alpha, c.gamma, n);
	const h = recip.map((v, i) => v / (i + 1));
	const sloc = [s0, c.beta, c.alpha, c.gamma];
	const hSq = polyMultiply(h, h, n);
	const prod = polyMultiply(sloc, hSq, n).map((v) => v * s0);
	prod[0] = 0;
	prod[1] = 0;
	return horner(prod.slice(2), k);
}

/**
 * Coefficients c with sigma_2(k) = sum_i c[i]*k^i for the centre cubic
 * (already anchored at y=0). `scale` converts annualised % to total vol; the
 * output is total vol. Port of `sigma2_poly_coeffs_from_cubic`.
 */
export function sigma2PolyCoeffsFromCubic(
	c: CubicCoeffs,
	scale: number,
	n: number,
): number[] {
	const s0 = c.sigma / scale;
	const b0 = c.beta / scale;
	const a0 = c.alpha / scale;
	const g0 = c.gamma / scale;

	const recip = reciprocalCubicTaylor(s0, b0, a0, g0, n);
	const h = recip.map((v, i) => v / (i + 1));
	const w = reciprocalSeries(h, n);

	const sloc = new Array<number>(n).fill(0);
	sloc[0] = s0;
	sloc[1] = b0;
	sloc[2] = a0;
	sloc[3] = g0;

	const sigma0 = s0;
	const hSq = polyMultiply(h, h, n);
	const piPoly = polyMultiply(sloc, hSq, n).map((v) => sigma0 * v);
	piPoly[0] = 0;
	piPoly[1] = 0;

	const log1pPi = new Array<number>(n).fill(0);
	let piPow = piPoly.slice();
	for (let m = 1; m <= Math.floor(n / 2); m++) {
		if (m > 1) piPow = polyMultiply(piPow, piPoly, n);
		const coef = (((m + 1) % 2 === 0 ? 1 : -1) * 1) / m; // (-1)^(m+1)/m
		for (let i = 0; i < n; i++) log1pPi[i] += coef * piPow[i];
	}

	const lpShifted = new Array<number>(n).fill(0);
	for (let i = 0; i < n - 2; i++) lpShifted[i] = log1pPi[i + 2];

	const w2 = polyMultiply(w, w, n);
	const w3 = polyMultiply(w2, w, n);
	const w5 = polyMultiply(w3, w2, n);

	const sigma1P = polyMultiply(w3, lpShifted, n).map((v) => 0.5 * v);

	const sd1 = new Array<number>(n).fill(0);
	sd1[0] = b0;
	sd1[1] = 2 * a0;
	sd1[2] = 3 * g0;

	const sd2 = new Array<number>(n).fill(0);
	sd2[0] = 2 * a0;
	sd2[1] = 6 * g0;

	const aLog = new Array<number>(n).fill(0);
	aLog[0] = s0 + b0;
	aLog[1] = b0 + 2 * a0;
	aLog[2] = a0 + 3 * g0;
	aLog[3] = g0;

	const aLogSq = polyMultiply(aLog, aLog, n);
	const aLogSqOverSig = polyMultiply(aLogSq, recip, n);

	const fPoly = new Array<number>(n).fill(0);
	for (let i = 0; i < n; i++)
		fPoly[i] = sd1[i] + sd2[i] - 0.5 * aLogSqOverSig[i];

	const uTilde = fPoly.map((v, i) => v / (i + 1));
	const u1u0P = polyMultiply(uTilde, w, n).map((v) => 0.25 * v);

	const rPoly = new Array<number>(n).fill(0);
	const term1 = polyMultiply(sigma1P, w2, n);
	const term3 = polyMultiply(u1u0P, w3, n);
	for (let i = 0; i < n; i++)
		rPoly[i] = -3 * term1[i] + 0.125 * w5[i] + term3[i];

	const sigma1Sq = polyMultiply(sigma1P, sigma1P, n);
	const term2P = polyMultiply(sigma1Sq, h, n).map((v) => 1.5 * v);

	const sPoly = rPoly.slice();
	for (let i = 0; i < n - 2; i++) sPoly[i + 2] += term2P[i];
	sPoly[0] = 0;
	sPoly[1] = 0;

	return sPoly.slice(2);
}

export { horner };
