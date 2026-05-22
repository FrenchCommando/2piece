/**
 * Orchestration: given user inputs build the implied-vol curves the page /
 * graphs need. Units: sigma,beta,alpha,gamma,delta are coefficients in
 * annualised %, k = log(K/F). All output curves are annualised %.
 *
 * The ATM knot adds delta*k^3*H(k). Because the perturbation and its first
 * two derivatives vanish at k=0, the surface for k>0 is just the base cubic
 * with gamma -> gamma+delta (C^2-joined at 0). Each closed-form method's
 * integration domain [0,k] stays on one side of the knot, so per-k we feed
 * the effective single cubic — exactly the piecewise behaviour of the
 * production calibrator with a knot pinned at ATM.
 */

import { bbf0 } from "./bbf0";
import type { CubicCoeffs } from "./cubic";
import { sigmaLoc } from "./cubic";
import { ghlow2 } from "./ghlow2";
import { knotSpikeGhlow2cc, knotSpikePhl1 } from "./kernel";
import { impliedVolFromPrices, solveDupirePde } from "./pde";
import { phl1 } from "./phl1";

export interface ModelInputs {
	sigma: number;
	beta: number;
	alpha: number;
	gamma: number;
	delta: number; // gamma discontinuity at the ATM knot (0 = no knot)
	dte: number; // business days to expiry; n_bdays = max(1, dte)
}

export interface ModelCurves {
	k: number[];
	sigmaLoc: number[];
	bbf0: number[];
	phl1: number[];
	ghlow2: number[];
	/** PHL1c = PHL1 + universal K_1^dir kernel (BBF0 and sigma_1
	 * delta-variations subtracted). Equals PHL1 when delta=0. */
	phl1c: number[];
	/** GHLOW2c = GHLOW2 + the same universal K_1^dir kernel that PHL1c
	 * uses (i.e. PHL1c + sigma_2 T^2). Repairs the sigma_1 slope kink at
	 * the knot but still carries the analytic value jump from sigma_2(0)'s
	 * delta-variation. Equals GHLOW2 when delta=0. */
	ghlow2c: number[];
	/** GHLOW2cc = GHLOW2 + extended kernel K_1^ext = K_1^dir minus
	 * sigma_2's delta-variation (cubic-parameter-dependent at order
	 * x^0..x^n). Closes both the sigma_1 slope kink and the sigma_2 value
	 * jump at the C^2 knot. Equals GHLOW2 when delta=0. */
	ghlow2cc: number[];
	pde: number[];
	hasKnot: boolean;
	/** [min, max] k where the closed-form maps stay valid (sigma_loc > 0).
	 * Equals the full band when nothing is masked. */
	kValid: [number, number];
	scale: number;
	sigmaTotal: number;
}

export function volScale(nBdays: number): number {
	return (Math.sqrt(252) / Math.sqrt(Math.max(nBdays, 1))) * 100;
}

function effectiveCubic(k: number, c: CubicCoeffs, delta: number): CubicCoeffs {
	return k > 0 && delta !== 0 ? { ...c, gamma: c.gamma + delta } : c;
}

function perturbedSigmaLoc(k: number, c: CubicCoeffs, delta: number): number {
	return sigmaLoc(k, c) + (k > 0 ? delta * k * k * k : 0);
}

export interface PdeRes {
	nGrid: number;
	nSteps: number;
}

/** Build all curves on a strike band of +/- a few sigma_total around ATM. */
export function computeCurves(
	inp: ModelInputs,
	nPoints = 401,
	pdeRes: PdeRes = { nGrid: 3201, nSteps: 3200 },
): ModelCurves {
	const c: CubicCoeffs = {
		sigma: inp.sigma,
		beta: inp.beta,
		alpha: inp.alpha,
		gamma: inp.gamma,
	};
	const nBdays = Math.max(1, Math.round(inp.dte));
	const scale = volScale(nBdays);
	const sigmaTotal = inp.sigma / scale;
	const hasKnot = inp.delta !== 0;

	const kLo = -3.5 * sigmaTotal;
	const kHi = 3.0 * sigmaTotal;
	const k: number[] = [];
	for (let i = 0; i < nPoints; i++)
		k.push(kLo + ((kHi - kLo) * i) / (nPoints - 1));

	const sLoc = k.map((kk) => perturbedSigmaLoc(kk, c, inp.delta));

	// The closed-form maps all divide by sigma_loc (BBF0 integrates 1/sigma_loc
	// over [0,k]; PHL1/GHLOW2/correction build on it). Once the cubic crosses
	// zero on a wing the integrand has a pole and the maps blow up — they are
	// only valid where sigma_loc > 0. Walk outward from ATM in each direction
	// and drop (NaN) every point at/after the first non-positive sigma_loc, so
	// the curves simply stop at the validity boundary. The PDE is unaffected
	// (it never divides by sigma_loc) and the sigma_loc panel still shows the
	// dive so the boundary is visible.
	let atm = 0;
	for (let i = 1; i < k.length; i++)
		if (Math.abs(k[i]) < Math.abs(k[atm])) atm = i;
	const valid = new Array<boolean>(k.length).fill(true);
	for (let i = atm; i < k.length; i++) {
		if (sLoc[i] <= 0) {
			for (let j = i; j < k.length; j++) valid[j] = false;
			break;
		}
	}
	for (let i = atm; i >= 0; i--) {
		if (sLoc[i] <= 0) {
			for (let j = i; j >= 0; j--) valid[j] = false;
			break;
		}
	}

	const mask = (v: number, i: number) => (valid[i] ? v : NaN);
	// GHLOW2 uses the same one-sided integral trick as BBF0/PHL1: its quadrature
	// node range [min(k,0), max(k,0)] stays on a single side of the ATM knot, so
	// the per-k effective cubic (gamma -> gamma+delta on the k>0 side) gives the
	// exact piecewise answer with no extra machinery.
	const bbf0Curve = k.map((kk, i) =>
		mask(bbf0(kk, effectiveCubic(kk, c, inp.delta)), i),
	);
	const phl1Curve = k.map((kk, i) =>
		mask(phl1(kk, effectiveCubic(kk, c, inp.delta), scale), i),
	);
	const ghlow2Curve = k.map((kk, i) =>
		mask(ghlow2(kk, effectiveCubic(kk, c, inp.delta), scale), i),
	);
	// PHL1c: PHL1 + universal K_1^dir (BBF0 + σ_1 δ-variations subtracted).
	// GHLOW2c: GHLOW2 + the same universal kernel — equivalent to PHL1c + σ_2 T².
	//   Repairs σ_1's slope kink; σ_2's value jump at k=0 remains.
	// GHLOW2cc: GHLOW2 + extended kernel K_1^ext = K_1^dir minus σ_2's
	//   δ-variation (the b/20·δ·σ_total^3 scalar at x=0). Closes the value
	//   jump too. All three reduce to their baseline when delta=0.
	const phl1cCurve = phl1Curve.map(
		(p, i) => p + knotSpikePhl1(k[i], inp.delta, sigmaTotal),
	);
	const ghlow2cCurve = ghlow2Curve.map(
		(g, i) => g + knotSpikePhl1(k[i], inp.delta, sigmaTotal),
	);
	const ghlow2ccCurve = ghlow2Curve.map(
		(g, i) => g + knotSpikeGhlow2cc(k[i], c, inp.delta, sigmaTotal, scale),
	);

	// PDE on a widened grid so Dirichlet boundary mass is negligible.
	const gLo = 2 * kLo;
	const gHi = 2 * kHi;
	const nG = pdeRes.nGrid;
	const kGrid: number[] = [];
	for (let i = 0; i < nG; i++) kGrid.push(gLo + ((gHi - gLo) * i) / (nG - 1));
	const sigPct = kGrid.map((kk) => perturbedSigmaLoc(kk, c, inp.delta));
	const callPrices = solveDupirePde(kGrid, sigPct, pdeRes.nSteps, scale);
	const ivPde = impliedVolFromPrices(kGrid, callPrices).map((v) => v * scale);
	const pde = k.map((kk) => interp(kk, kGrid, ivPde, kLo, kHi));

	const firstValid = valid.indexOf(true);
	const lastValid = valid.lastIndexOf(true);
	const kValid: [number, number] =
		firstValid < 0 ? [kLo, kHi] : [k[firstValid], k[lastValid]];

	return {
		k,
		sigmaLoc: sLoc,
		bbf0: bbf0Curve,
		phl1: phl1Curve,
		ghlow2: ghlow2Curve,
		phl1c: phl1cCurve,
		ghlow2c: ghlow2cCurve,
		ghlow2cc: ghlow2ccCurve,
		pde,
		hasKnot,
		kValid,
		scale,
		sigmaTotal,
	};
}

/** Linear interpolation of (xs, ys) at x, restricted to [lo, hi]. */
function interp(
	x: number,
	xs: number[],
	ys: number[],
	lo: number,
	hi: number,
): number {
	const xc = Math.min(Math.max(x, lo), hi);
	let i = 1;
	while (i < xs.length - 1 && xs[i] < xc) i++;
	const x0 = xs[i - 1];
	const x1 = xs[i];
	const t = (xc - x0) / (x1 - x0);
	return ys[i - 1] + t * (ys[i] - ys[i - 1]);
}
