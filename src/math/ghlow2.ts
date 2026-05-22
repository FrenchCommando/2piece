/**
 * GHLOW2 — BBF0 + PHL1 + Gatheral-Hsu-Laurence-Ouyang-Wang second-order
 * sigma_2 * T^2 (their eq. 3.19, time-homogeneous, r=0).
 *
 *   sigma_2 = -3 sigma_1/d^2 + 3 sigma_1^2/(2 iv_hm) + xi^3/(8 d^5) + xi (u1/u0)/d^3
 *   xi = -k,  d = xi / iv_hm,  u1/u0 = Yoshida heat-kernel ratio
 *   GHLOW2 = iv_hm + sigma_1 + sigma_2   (total vol; * scale for annualised %)
 *
 * Near |k| < 1e-3, sigma_2 is evaluated from the cancellation-free polynomial.
 * Port of single_cubic.{u1_over_u0, sigma_2, ghlow2_iv}.
 */

import { bbf0 } from "./bbf0";
import {
	type CubicCoeffs,
	horner,
	N_TERMS,
	sigma2PolyCoeffsFromCubic,
	sigmaLocDerivs,
} from "./cubic";
import { gaussLegendre } from "./gl";
import { sigma1 } from "./phl1";

const N_GAUSS = 16;
const U1U0_ATM_EPS = 1e-10;
const SIGMA_2_POLY_THRESHOLD = 1e-3;

/** Yoshida heat-kernel ratio u_1/u_0 in total vol^2. */
export function u1OverU0(k: number, c: CubicCoeffs, scale: number): number {
	const [s0p, s1p, s2p] = sigmaLocDerivs(0, c);
	const s0 = s0p / scale;
	const s1a = s1p / scale;
	const s2a = s2p / scale;
	const aPrimeAtm = s0 + s1a;
	const fAtm = s1a + s2a - (0.5 * (aPrimeAtm * aPrimeAtm)) / s0;
	const u1u0Atm = (s0 * fAtm) / 4;
	if (Math.abs(k) < U1U0_ATM_EPS) return u1u0Atm;

	const intLo = Math.min(k, 0);
	const intHi = Math.max(k, 0);
	const { nodes, weights } = gaussLegendre(N_GAUSS);
	const half = 0.5 * (intHi - intLo);
	const mid = 0.5 * (intHi + intLo);
	let totU1 = 0;
	let totInv = 0;
	for (let i = 0; i < N_GAUSS; i++) {
		const [sp, s1pp, s2pp] = sigmaLocDerivs(mid + half * nodes[i], c);
		const s = sp / scale;
		const sd1 = s1pp / scale;
		const sd2 = s2pp / scale;
		const aLog = s + sd1;
		totU1 += weights[i] * (sd1 + sd2 - (0.5 * (aLog * aLog)) / s);
		totInv += weights[i] / s;
	}
	totU1 *= half;
	totInv *= half;
	return totU1 / (4 * totInv);
}

/** sigma_2 in total vol. */
export function sigma2(k: number, c: CubicCoeffs, scale: number): number {
	if (Math.abs(k) < SIGMA_2_POLY_THRESHOLD) {
		const coeffs = sigma2PolyCoeffsFromCubic(c, scale, N_TERMS);
		return horner(coeffs, k);
	}
	const ivHmTotal = bbf0(k, c) / scale;
	const s1 = sigma1(k, c, scale);
	const u1u0 = u1OverU0(k, c, scale);
	const xi = -k;
	const d = xi / ivHmTotal;
	return (
		(-3 * s1) / (d * d) +
		(3 * s1 * s1) / (2 * ivHmTotal) +
		(xi * xi * xi) / (8 * d ** 5) +
		(xi * u1u0) / (d * d * d)
	);
}

/** GHLOW2 implied vol in annualised %. */
export function ghlow2(k: number, c: CubicCoeffs, scale: number): number {
	const ivHmTotal = bbf0(k, c) / scale;
	return (ivHmTotal + sigma1(k, c, scale) + sigma2(k, c, scale)) * scale;
}

export function ghlow2Curve(
	ks: number[],
	c: CubicCoeffs,
	scale: number,
): number[] {
	return ks.map((k) => ghlow2(k, c, scale));
}
