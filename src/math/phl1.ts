/**
 * PHL1 — BBF0 + Henry-Labordere first-order sigma_1 correction.
 *
 *   sigma_1(k) = iv_hm^3/(2 k^2) * log1p((sigma_0*sigma_loc(k) - iv_hm^2)/iv_hm^2)
 *   PHL1 = iv_hm + sigma_1     (total vol; * scale for annualised %)
 *
 * Near |k| < 1e-3 the float64 subtraction loses too many digits, so the
 * log1p argument is evaluated analytically from the cubic (cancellation-free).
 * Port of single_cubic.{sigma_1, phl1_corrected_iv}.
 */
import { bbf0 } from "./bbf0";
import {
	type CubicCoeffs,
	N_TERMS,
	sigmaLoc,
	singlePieceLog1pArg,
} from "./cubic";

const SIGMA_1_POLY_THRESHOLD = 1e-3;
const LOG1P_SMALL_THRESHOLD = 1e-4;

/** sigma_1 in total vol. `scale` = vol_scale_function(n_bdays). */
export function sigma1(k: number, c: CubicCoeffs, scale: number): number {
	const ivHmTotal = bbf0(k, c) / scale;
	if (Math.abs(k) >= SIGMA_1_POLY_THRESHOLD) {
		const sigmaLocTotal = sigmaLoc(k, c) / scale;
		const sigma0Total = c.sigma / scale;
		const arg =
			(sigma0Total * sigmaLocTotal - ivHmTotal * ivHmTotal) /
			(ivHmTotal * ivHmTotal);
		return (ivHmTotal ** 3 / (2 * k * k)) * Math.log1p(arg);
	}
	const pOverK2 = singlePieceLog1pArg(k, c, N_TERMS);
	const pTotal = pOverK2 * k * k;
	const log1pOverP =
		Math.abs(pTotal) < LOG1P_SMALL_THRESHOLD
			? 1 - pTotal / 2 + (pTotal * pTotal) / 3 - (pTotal * pTotal * pTotal) / 4
			: Math.log1p(pTotal) / pTotal;
	return (ivHmTotal ** 3 / 2) * pOverK2 * log1pOverP;
}

/** PHL1 implied vol in annualised %. */
export function phl1(k: number, c: CubicCoeffs, scale: number): number {
	const ivHmTotal = bbf0(k, c) / scale;
	return (ivHmTotal + sigma1(k, c, scale)) * scale;
}

export function phl1Curve(
	ks: number[],
	c: CubicCoeffs,
	scale: number,
): number[] {
	return ks.map((k) => phl1(k, c, scale));
}
