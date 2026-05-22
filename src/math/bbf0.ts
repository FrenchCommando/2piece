/**
 * BBF0 — leading-order inverse-harmonic-mean map (Berestycki-Busca-Florent).
 *
 *   BBF0(k) = k / integral_0^k dy / sigma_loc(y)      (annualised %)
 *   BBF0(0) = sigma_loc(0)                            (L'Hopital)
 *
 * 16-pt Gauss-Legendre on [0, k], single cubic piece. Port of
 * single_cubic.iv_hm.
 */

import { type CubicCoeffs, sigmaLoc } from "./cubic";
import { gaussLegendre } from "./gl";

const K_ATM_EPS = 1e-15;
const N_GAUSS = 16;

export function bbf0(k: number, c: CubicCoeffs): number {
	if (Math.abs(k) < K_ATM_EPS) return c.sigma;
	const { nodes, weights } = gaussLegendre(N_GAUSS);
	const half = 0.5 * k;
	let g = 0;
	for (let i = 0; i < N_GAUSS; i++) {
		g += weights[i] / sigmaLoc(half * nodes[i] + half, c);
	}
	g *= half;
	return k / g;
}

export function bbf0Curve(ks: number[], c: CubicCoeffs): number[] {
	return ks.map((k) => bbf0(k, c));
}
