/**
 * BBF0 — leading-order inverse-harmonic-mean map (Berestycki–Busca–Florent).
 *
 *   BBF0(k) = k / ∫₀ᵏ dy / σ_loc(y)        (annualised %)
 *   BBF0(0) = σ_loc(0)                       (L'Hôpital)
 *
 * Closed form for cubic σ_loc(y) = σ + βy + αy² + γy³ via partial fractions.
 * Three regime branches by the magnitude of the leading coefficients:
 *
 *   1. γ negligible, α negligible        ⇒ linear, single log
 *   2. γ negligible, α non-trivial       ⇒ quadratic: real roots give a log
 *                                          pair; complex roots give arctan
 *   3. γ non-trivial                     ⇒ depressed cubic via z = y − α/(3γ).
 *                                          Discriminant ≥ 0: three real roots
 *                                          (trigonometric Cardano), partial
 *                                          fractions to three logs. Discriminant
 *                                          < 0: one real root via Cardano,
 *                                          factor to linear × irreducible
 *                                          quadratic, partial fractions to one
 *                                          log + one log + one arctan.
 *
 * Validity: when any real root of σ_loc lies inside the closed integration
 * interval, the integrand blows up and the integral is undefined. The
 * function returns NaN there; `model.computeCurves` masks those points
 * (see NOTES.md §"Closed-form validity masking"). At k=0 we short-circuit
 * to σ by L'Hôpital.
 */

import { type CubicCoeffs, sigmaLoc } from "./cubic";

const K_ATM_EPS = 1e-15;
const GAMMA_THR = 1e-9;
const ALPHA_THR = 1e-9;
const BETA_THR = 1e-30;

export function bbf0(k: number, c: CubicCoeffs): number {
	if (Math.abs(k) < K_ATM_EPS) return c.sigma;
	// σ_loc must be the same sign at both endpoints — if it crosses zero
	// the integrand has a pole.
	if (Math.sign(sigmaLoc(0, c)) !== Math.sign(sigmaLoc(k, c))) return NaN;
	const G = recipIntegral(k, c);
	if (!Number.isFinite(G) || G === 0) return NaN;
	return k / G;
}

export function bbf0Curve(ks: number[], c: CubicCoeffs): number[] {
	return ks.map((k) => bbf0(k, c));
}

/** ∫₀ᵏ dy / (σ + βy + αy² + γy³). Branches by leading-coefficient regime. */
function recipIntegral(k: number, c: CubicCoeffs): number {
	const { sigma, beta, alpha, gamma } = c;
	if (Math.abs(gamma) > GAMMA_THR) {
		return cubicIntegral(k, sigma, beta, alpha, gamma);
	}
	if (Math.abs(alpha) > ALPHA_THR) {
		return quadraticIntegral(k, sigma, beta, alpha);
	}
	if (Math.abs(beta) > BETA_THR) {
		return Math.log1p((beta * k) / sigma) / beta;
	}
	return k / sigma;
}

/** ∫₀ᵏ dy / (σ + βy + αy²). Discriminant β² − 4ασ splits log/arctan. */
function quadraticIntegral(
	k: number,
	sigma: number,
	beta: number,
	alpha: number,
): number {
	const disc = beta * beta - 4 * alpha * sigma;
	if (disc > 0) {
		// Two real roots r₁, r₂. ∫ dy/[α(y−r₁)(y−r₂)] = (log|y−r₁|/|y−r₂|) / [α(r₁−r₂)].
		const sqrtD = Math.sqrt(disc);
		const inv2a = 0.5 / alpha;
		const r1 = (-beta + sqrtD) * inv2a;
		const r2 = (-beta - sqrtD) * inv2a;
		// Endpoint pole check (k=0 always lies between if a root is at 0).
		if (rootInsideClosedInterval(r1, 0, k)) return NaN;
		if (rootInsideClosedInterval(r2, 0, k)) return NaN;
		const fac = 1 / (alpha * (r1 - r2));
		return (
			fac *
			(Math.log(Math.abs((k - r1) / r1)) - Math.log(Math.abs((k - r2) / r2)))
		);
	}
	// Complex conjugate roots. Complete the square; integral becomes
	// (2/√(−disc)) · [arctan((2αy+β)/√(−disc))] evaluated 0→k.
	const sqrtD = Math.sqrt(-disc);
	const u = (2 * alpha * k + beta) / sqrtD;
	const u0 = beta / sqrtD;
	return (2 / sqrtD) * (Math.atan(u) - Math.atan(u0));
}

/** ∫₀ᵏ dy / (σ + βy + αy² + γy³). γ non-trivial path. */
function cubicIntegral(
	k: number,
	sigma: number,
	beta: number,
	alpha: number,
	gamma: number,
): number {
	// Depress via y = z − α/(3γ): γy³ + αy² + βy + σ = γ(z³ + pz + q).
	const shift = alpha / (3 * gamma);
	const p = (3 * gamma * beta - alpha * alpha) / (3 * gamma * gamma);
	const q =
		(2 * alpha ** 3 - 9 * gamma * alpha * beta + 27 * gamma * gamma * sigma) /
		(27 * gamma ** 3);
	// Sign convention: disc > 0 means three distinct real roots.
	const disc = -(4 * p ** 3 + 27 * q * q);

	if (disc >= 0) {
		// Three real roots via trigonometric Cardano: roots are
		//   r_k = 2·√(−p/3)·cos(θ + 2πk/3) − α/(3γ),
		// with θ = (1/3)·acos((3q)/(2p)·√(−3/p)).
		if (Math.abs(p) < 1e-30) {
			// p = 0 and disc ≥ 0 forces q = 0 — triple root at −α/(3γ).
			return tripleRootIntegral(k, gamma, -shift);
		}
		const S = Math.sqrt(-p / 3);
		const cosArg = clamp(-q / (2 * S * S * S), -1, 1);
		const theta = Math.acos(cosArg) / 3;
		const TWO_PI_OVER_3 = (2 * Math.PI) / 3;
		const r0 = 2 * S * Math.cos(theta) - shift;
		const r1 = 2 * S * Math.cos(theta - TWO_PI_OVER_3) - shift;
		const r2 = 2 * S * Math.cos(theta + TWO_PI_OVER_3) - shift;
		return threeRealRootsIntegral(k, gamma, r0, r1, r2);
	}

	// One real root + complex conjugate pair. Cardano's cube-root form.
	const D = q * q / 4 + p ** 3 / 27;
	const sqrtD = Math.sqrt(D);
	const u = signedCbrt(-q / 2 + sqrtD) + signedCbrt(-q / 2 - sqrtD);
	const r = u - shift;
	// Factor σ_loc(y) = γ(y − r)(y² + a₁y + a₂):
	//   expansion ⇒ a₁ = α/γ + r,  a₂ = −σ/(γr)  (provided r ≠ 0).
	if (Math.abs(r) < 1e-30) return NaN;
	const a1 = alpha / gamma + r;
	const a2 = -sigma / (gamma * r);
	return oneRealRootIntegral(k, gamma, r, a1, a2);
}

function rootInsideClosedInterval(r: number, a: number, b: number): boolean {
	const lo = Math.min(a, b);
	const hi = Math.max(a, b);
	return r >= lo && r <= hi;
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.min(Math.max(x, lo), hi);
}

function signedCbrt(x: number): number {
	return x >= 0 ? Math.cbrt(x) : -Math.cbrt(-x);
}

/** ∫₀ᵏ dy / [γ(y − r)³] = (1/γ) · [−(1/2)·((k−r)⁻² − r⁻²)]. */
function tripleRootIntegral(k: number, gamma: number, r: number): number {
	if (rootInsideClosedInterval(r, 0, k)) return NaN;
	if (Math.abs(r) < 1e-30) return NaN;
	const a = k - r;
	const b = -r;
	return (-0.5 / gamma) * (1 / (a * a) - 1 / (b * b));
}

/**
 * ∫₀ᵏ dy / [γ(y − r₀)(y − r₁)(y − r₂)] via partial fractions
 * Σᵢ Aᵢ · log|(y − rᵢ)/(−rᵢ)| with Aᵢ = 1 / [γ·∏_{j≠i}(rᵢ − rⱼ)].
 */
function threeRealRootsIntegral(
	k: number,
	gamma: number,
	r0: number,
	r1: number,
	r2: number,
): number {
	if (rootInsideClosedInterval(r0, 0, k)) return NaN;
	if (rootInsideClosedInterval(r1, 0, k)) return NaN;
	if (rootInsideClosedInterval(r2, 0, k)) return NaN;
	const d0 = (r0 - r1) * (r0 - r2);
	const d1 = (r1 - r0) * (r1 - r2);
	const d2 = (r2 - r0) * (r2 - r1);
	if (Math.abs(d0) < 1e-30 || Math.abs(d1) < 1e-30 || Math.abs(d2) < 1e-30) {
		// Near-coincident roots — partial-fraction coefficients blow up.
		// Caller should never see this in practice for our calibrated cubics;
		// returning NaN forces a mask rather than a silent numerical lie.
		return NaN;
	}
	const A0 = 1 / (gamma * d0);
	const A1 = 1 / (gamma * d1);
	const A2 = 1 / (gamma * d2);
	return (
		A0 * Math.log(Math.abs((k - r0) / r0)) +
		A1 * Math.log(Math.abs((k - r1) / r1)) +
		A2 * Math.log(Math.abs((k - r2) / r2))
	);
}

/**
 * ∫₀ᵏ dy / [γ(y − r)(y² + a₁y + a₂)] for the one-real-root case (so the
 * quadratic factor has negative discriminant a₁² − 4a₂ < 0).
 *
 * Partial fractions 1/[(y−r)(y² + a₁y + a₂)] = A/(y−r) + (By + C)/(y² + a₁y + a₂)
 * with A = 1/(r² + a₁r + a₂), B = −A, C = −A(r + a₁). The (By + C) numerator
 * splits as (B/2)·d/dy(y² + a₁y + a₂) plus a constant (C − B·a₁/2), giving a
 * log and an arctan. The γ factor scales A/B/C uniformly.
 */
function oneRealRootIntegral(
	k: number,
	gamma: number,
	r: number,
	a1: number,
	a2: number,
): number {
	if (rootInsideClosedInterval(r, 0, k)) return NaN;
	const halfA1Sq = 0.25 * a1 * a1;
	const rr = a2 - halfA1Sq;
	// rr ≤ 0 would mean the quadratic factor has real roots — contradicts
	// the one-real-root branch. If it happens, signal an unhandled case.
	if (rr <= 0) return NaN;
	const sqrtRR = Math.sqrt(rr);
	const denom = r * r + a1 * r + a2;
	if (Math.abs(denom) < 1e-30) return NaN;
	const A = 1 / (gamma * denom);
	const B = -A;
	const C = -A * (r + a1);

	const halfB = 0.5 * B;
	const arctanCoef = (C - 0.5 * B * a1) / sqrtRR;
	const evalAt = (y: number): number =>
		A * Math.log(Math.abs(y - r)) +
		halfB * Math.log(y * y + a1 * y + a2) +
		arctanCoef * Math.atan((y + 0.5 * a1) / sqrtRR);

	return evalAt(k) - evalAt(0);
}
