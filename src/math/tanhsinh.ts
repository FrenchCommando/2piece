/**
 * Double-exponential / tanh-sinh quadrature on [0, 1] (mapped from [-1, 1]
 * via λ = (1+x)/2 with x = tanh((π/2) sinh(t)), then trapezoidal in t).
 *
 * The double-exponential decay of `dλ/dt` at large |t| swallows endpoint
 * singularities and slow tails — near-exponential convergence on smooth-ish
 * integrands. Cost: many more nodes than Gauss for the same accuracy on
 * benign integrands. That trade-off is the whole point of including it in
 * the comparison panel.
 *
 *   t_k = h·k,   λ_k = ½(1 + tanh((π/2) sinh(t_k)))
 *   w_k = (h · π/2 · cosh(t_k)) / cosh²((π/2) sinh(t_k))   on [-1, 1]
 *   ⇒  weight on [0, 1] is w_k / 2 (from dx = 2 dλ).
 */

export interface TanhSinh {
	nodes: number[];
	weights: number[];
}

const cache = new Map<number, TanhSinh>();

/**
 * Total-node-count parameterisation. h is picked so the outermost weight
 * lands near machine epsilon; concretely t_max ≈ asinh((2/π)·log(2/ε)) and
 * h = t_max / kMax with kMax = (N−1)/2. N must be odd (symmetric placement
 * about t = 0); we round up otherwise.
 */
export function tanhSinhRule(N: number): TanhSinh {
	if (N < 3) throw new Error(`tanhSinhRule: N=${N} too small`);
	const Nodd = N % 2 === 0 ? N + 1 : N;
	const hit = cache.get(Nodd);
	if (hit) return hit;

	const kMax = (Nodd - 1) >> 1;
	// For the outermost weight to be ~1e-16, (π/2)·sinh(t_max) ≈ log(2/eps) ≈ 37.
	// Solve sinh(t_max) ≈ 23.6 → t_max ≈ asinh(23.6) ≈ 3.85. So h ≈ 3.85 / kMax.
	const h = 3.85 / kMax;

	const nodes = new Array<number>(Nodd);
	const weights = new Array<number>(Nodd);
	for (let k = -kMax; k <= kMax; k++) {
		const t = h * k;
		const sinhT = Math.sinh(t);
		const coshT = Math.cosh(t);
		const piSinh = (Math.PI / 2) * sinhT;
		const piCosh = (Math.PI / 2) * coshT;
		const c = Math.cosh(piSinh);
		const x = Math.tanh(piSinh);
		const w = (h * piCosh) / (c * c);
		nodes[k + kMax] = 0.5 * (1 + x);
		weights[k + kMax] = 0.5 * w;
	}

	const out = { nodes, weights };
	cache.set(Nodd, out);
	return out;
}
