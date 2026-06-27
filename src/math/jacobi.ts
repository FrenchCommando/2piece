/**
 * Gauss-Jacobi nodes/weights via Golub-Welsch: build the symmetric tridiagonal
 * Jacobi matrix from the orthogonal-polynomial three-term recurrence, then
 * extract eigenvalues (nodes) and the first row of the eigenvector matrix
 * (weights ∝ entries squared, times the weight integral μ_0). Implicit
 * symmetric-tridiagonal QL with Wilkinson shifts; ~1e-14 accuracy.
 *
 * Specialised to the (1-x²)^{3/2} ultraspherical weight, then mapped from
 * [-1, 1] to [0, 1] so it matches the K_1 bridge integral's natural form
 * ∫₀¹ (λ(1-λ))^{3/2} f(η(λ;x)) dλ. At n=1 the rule recovers the
 * Beta-function value K_1(0, 0) = 3√(2π)/128 exactly.
 */

export interface GaussJacobi {
	nodes: number[];
	weights: number[];
}

const cache = new Map<string, GaussJacobi>();

/** Lanczos approximation of log Γ, ~1e-14 accuracy on x > 0. */
function lgamma(x: number): number {
	if (x < 0.5) {
		return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
	}
	const c = [
		0.99999999999980993, 676.5203681218851, -1259.1392167224028,
		771.32342877765313, -176.61502916214059, 12.507343278686905,
		-0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
	];
	x -= 1;
	const g = 7;
	const t = x + g + 0.5;
	let a = c[0];
	for (let i = 1; i < c.length; i++) a += c[i] / (x + i);
	return (
		0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
	);
}

/**
 * n-point Gauss-Jacobi rule on [-1, 1] for weight (1-x)^α (1+x)^β.
 * Eigenvalues = nodes, μ_0 · z_i² = weights with z = first row of eigenvectors.
 */
function gaussJacobiOn11(n: number, alpha: number, beta: number): GaussJacobi {
	const d = new Array<number>(n).fill(0);
	const e = new Array<number>(n + 1).fill(0);
	for (let k = 0; k < n; k++) {
		const s = 2 * k + alpha + beta;
		d[k] =
			s === 0
				? (beta - alpha) / (alpha + beta + 2)
				: (beta * beta - alpha * alpha) / (s * (s + 2));
	}
	for (let k = 1; k < n; k++) {
		const s = 2 * k + alpha + beta;
		const num = 4 * k * (k + alpha) * (k + beta) * (k + alpha + beta);
		const den = s * s * (s - 1) * (s + 1);
		e[k] = Math.sqrt(num / den);
	}

	const mu0 = Math.exp(
		(alpha + beta + 1) * Math.log(2) +
			lgamma(alpha + 1) +
			lgamma(beta + 1) -
			lgamma(alpha + beta + 2),
	);

	// First row of eigenvectors, updated by every Givens rotation we apply.
	const z = new Array<number>(n).fill(0);
	z[0] = 1;

	// Implicit symmetric-tridiagonal QL with Wilkinson shifts (NR §11.4 tqli,
	// adapted to 0-indexing and to keep only the first eigenvector row).
	for (let l = 0; l < n; l++) {
		let iter = 0;
		let m: number;
		do {
			for (m = l; m < n - 1; m++) {
				const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
				if (Math.abs(e[m + 1]) <= 1e-15 * dd) break;
			}
			if (m === l) break;
			if (iter++ === 100) throw new Error("gaussJacobi: QL did not converge");

			let g = (d[l + 1] - d[l]) / (2 * e[l + 1]);
			const r0 = Math.hypot(g, 1);
			g = d[m] - d[l] + e[l + 1] / (g + (g >= 0 ? r0 : -r0));

			let s = 1;
			let c = 1;
			let p = 0;
			for (let i = m - 1; i >= l; i--) {
				const f = s * e[i + 1];
				const b = c * e[i + 1];
				const r = Math.hypot(f, g);
				e[i + 2] = r;
				if (r === 0) {
					d[i + 1] -= p;
					e[m + 1] = 0;
					break;
				}
				s = f / r;
				c = g / r;
				g = d[i + 1] - p;
				const rr = (d[i] - g) * s + 2 * c * b;
				p = s * rr;
				d[i + 1] = g + p;
				g = c * rr - b;
				const tz = z[i + 1];
				z[i + 1] = s * z[i] + c * tz;
				z[i] = c * z[i] - s * tz;
			}
			d[l] -= p;
			e[l + 1] = g;
			e[m + 1] = 0;
		} while (m !== l);
	}

	const idx = Array.from({ length: n }, (_, i) => i);
	idx.sort((i, j) => d[i] - d[j]);
	return {
		nodes: idx.map((i) => d[i]),
		weights: idx.map((i) => mu0 * z[i] * z[i]),
	};
}

/**
 * n-point Gauss-Jacobi(α=3/2, β=3/2) rule, MAPPED to [0, 1] so the user can
 * call `Σ wᵢ · f(λᵢ)` directly for ∫₀¹ (λ(1-λ))^{3/2} f(λ) dλ.
 *
 * Mapping λ = (1+x)/2 of (1-x²)^{3/2} on [-1,1] → 8·(λ(1-λ))^{3/2} on [0,1],
 * then dx = 2 dλ ⇒ the [0,1] weights are the [-1,1] weights divided by 16.
 */
export function gaussJacobi32(n: number): GaussJacobi {
	const key = `${n}|1.5|1.5`;
	const hit = cache.get(key);
	if (hit) return hit;
	const j = gaussJacobiOn11(n, 1.5, 1.5);
	const out: GaussJacobi = {
		nodes: j.nodes.map((x) => 0.5 * (x + 1)),
		weights: j.weights.map((w) => w / 16),
	};
	cache.set(key, out);
	return out;
}
