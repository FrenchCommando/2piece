/**
 * Diagnostic panel: how three different quadrature rules sample the K_1
 * bridge integral. Each rule's panel shows the function it operates on
 * (Gauss-Legendre and tanh-sinh see the full weighted W(λ); Gauss-Jacobi
 * absorbs the (λ(1-λ))^{3/2} weight and sees the bare g(λ) = f(η)). Filled
 * circles mark sample nodes, with radius mapped from log₁₀(weight) — so a
 * tiny edge weight (tanh-sinh near λ=0 or λ=1) shows as a tiny dot and a
 * fat central weight shows as a fat dot.
 *
 * A shared convergence sub-panel plots |error| vs node count for all three
 * rules. Reference value: tanh-sinh at 257 nodes — near machine precision
 * on this integrand.
 *
 * The slider lets the reader sweep x ∈ [-3, 3] (the dimensionless strike
 * argument to K_1) and watch the rules adapt.
 */

import { gaussLegendre } from "../math/gl";
import { gaussJacobi32 } from "../math/jacobi";
import { volScale } from "../math/model";
import { normCdf, normPdf } from "../math/normal";
import { tanhSinhRule } from "../math/tanhsinh";
import { byId, getContext2D } from "../util";
import { type ConvergenceSeries, drawQuadConvergence } from "./quadConvergence";

interface Rule {
	nodes: number[];
	weights: number[];
}

function fEta(eta: number): number {
	return (eta ** 3 + 3 * eta) * normCdf(eta) + (2 + eta * eta) * normPdf(eta);
}

function eta(lambda: number, x: number): number {
	return x * Math.sqrt(lambda / (1 - lambda));
}

/** Full weighted integrand — what GL and tanh-sinh apply to.
 *  Boundary collapse: tanh-sinh saturates λ to exactly 0 or 1, where
 *  (λ(1-λ))^{3/2}·f(η) = 0·∞ = NaN; the math says 0 there. */
function fullW(lambda: number, x: number): number {
	const m = lambda * (1 - lambda);
	if (m === 0) return 0;
	return m ** 1.5 * fEta(eta(lambda, x));
}

/** Bare integrand — what Gauss-Jacobi(3/2, 3/2) applies to (weight is in the rule). */
function bareG(lambda: number, x: number): number {
	return fEta(eta(lambda, x));
}

function ruleValue(r: Rule, fn: (lambda: number) => number): number {
	let acc = 0;
	for (let i = 0; i < r.nodes.length; i++) acc += r.weights[i] * fn(r.nodes[i]);
	return acc;
}

/** Plain Gauss-Legendre rule from [-1,1] mapped to [0,1]. */
function glOn01(n: number): Rule {
	const gl = gaussLegendre(n);
	return {
		nodes: gl.nodes.map((u) => 0.5 * (u + 1)),
		weights: gl.weights.map((w) => 0.5 * w),
	};
}

const N_SAMPLES = 240;

interface MethodPreview {
	id: string;
	title: string;
	rule: Rule;
	curve: (lambda: number) => number;
	value: number;
}

function makeMethods(x: number, n: number): MethodPreview[] {
	const gl = glOn01(n);
	const gj = gaussJacobi32(n);
	const ts = tanhSinhRule(n % 2 === 0 ? n + 1 : n); // tanh-sinh wants odd N
	return [
		{
			id: "q-gl",
			title: `Gauss–Legendre (n = ${gl.nodes.length})`,
			rule: gl,
			curve: (l) => fullW(l, x),
			value: ruleValue(gl, (l) => fullW(l, x)),
		},
		{
			id: "q-gj",
			title: `Gauss–Jacobi α=β=3/2 (n = ${gj.nodes.length})`,
			rule: gj,
			curve: (l) => bareG(l, x),
			value: ruleValue(gj, (l) => bareG(l, x)),
		},
		{
			id: "q-ts",
			title: `tanh–sinh (n = ${ts.nodes.length})`,
			rule: ts,
			curve: (l) => fullW(l, x),
			value: ruleValue(ts, (l) => fullW(l, x)),
		},
	];
}

const K1_PEAK_EXACT = (3 * Math.sqrt(2 * Math.PI)) / 128;

function drawMethodPanel(
	canvas: HTMLCanvasElement,
	m: MethodPreview,
	reference: number | null,
): void {
	const ctx = getContext2D(canvas);
	const dpr = window.devicePixelRatio || 1;
	const cssW = canvas.clientWidth;
	const cssH = canvas.clientHeight;
	if (cssW === 0 || cssH === 0) return;
	canvas.width = Math.round(cssW * dpr);
	canvas.height = Math.round(cssH * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssW, cssH);

	const PAD = { l: 52, r: 14, t: 30, b: 38 };
	const x0 = PAD.l;
	const x1 = cssW - PAD.r;
	const yt = PAD.t;
	const yb = cssH - PAD.b;

	// Sample integrand on a dense grid.
	const sx = new Array<number>(N_SAMPLES);
	const sy = new Array<number>(N_SAMPLES);
	for (let i = 0; i < N_SAMPLES; i++) {
		const l = i / (N_SAMPLES - 1);
		sx[i] = l;
		sy[i] = m.curve(l);
	}

	// Y range from sampled values at rule's own nodes — so we crop where the
	// rule chose not to sample (e.g. GJ doesn't sample λ ≈ 1 where g blows up).
	const nodeYs = m.rule.nodes.map((l) => m.curve(l));
	let yMax = -Infinity;
	let yMin = Infinity;
	for (const y of nodeYs) {
		if (y > yMax) yMax = y;
		if (y < yMin) yMin = y;
	}
	if (!Number.isFinite(yMax) || !Number.isFinite(yMin)) {
		yMax = 1;
		yMin = 0;
	}
	yMin = Math.min(yMin, 0);
	const span = Math.max(yMax - yMin, 1e-12);
	yMax += 0.28 * span; // headroom for off-screen curve indication
	yMin -= 0.04 * span;

	const xpx = (l: number): number => x0 + l * (x1 - x0);
	const ypx = (y: number): number =>
		yb - ((y - yMin) / (yMax - yMin)) * (yb - yt);

	// Axis frame.
	ctx.strokeStyle = "#e4e4e7";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x0, yt);
	ctx.lineTo(x0, yb);
	ctx.lineTo(x1, yb);
	ctx.stroke();

	// Zero-line if in range.
	if (yMin < 0 && yMax > 0) {
		ctx.strokeStyle = "#a1a1aa";
		ctx.beginPath();
		ctx.moveTo(x0, ypx(0));
		ctx.lineTo(x1, ypx(0));
		ctx.stroke();
	}

	// Tick labels.
	ctx.fillStyle = "#52525b";
	ctx.font = "10px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	for (const t of [0, 0.25, 0.5, 0.75, 1.0]) {
		ctx.fillText(t.toFixed(2), xpx(t), yb + 4);
	}
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	for (const t of [yMin, 0, yMax]) {
		if (t < yMin - 1e-12 || t > yMax + 1e-12) continue;
		const label =
			Math.abs(t) < 1e-12
				? "0"
				: Math.abs(t) >= 1000 || (Math.abs(t) < 0.01 && t !== 0)
					? t.toExponential(1)
					: t.toFixed(2);
		ctx.fillText(label, x0 - 5, ypx(t));
	}

	// Clip drawing to plot box.
	ctx.save();
	ctx.beginPath();
	ctx.rect(x0, yt, x1 - x0, yb - yt);
	ctx.clip();

	// Smooth integrand curve.
	ctx.strokeStyle = "#dc2626";
	ctx.lineWidth = 1.6;
	ctx.beginPath();
	let started = false;
	for (let i = 0; i < N_SAMPLES; i++) {
		const X = xpx(sx[i]);
		const Y = ypx(sy[i]);
		if (!Number.isFinite(Y)) {
			started = false;
			continue;
		}
		if (!started) {
			ctx.moveTo(X, Y);
			started = true;
		} else ctx.lineTo(X, Y);
	}
	ctx.stroke();

	// Stems from y=0 to (λᵢ, f(λᵢ)). Thin grey; the dot above carries the weight info.
	ctx.strokeStyle = "#94a3b8";
	ctx.lineWidth = 0.6;
	for (let i = 0; i < m.rule.nodes.length; i++) {
		const X = xpx(m.rule.nodes[i]);
		ctx.beginPath();
		ctx.moveTo(X, ypx(0));
		ctx.lineTo(X, ypx(nodeYs[i]));
		ctx.stroke();
	}

	// Filled circles per node. Radius from log₁₀(weight) — tanh-sinh's
	// huge weight dynamic range shows as a smooth gradient of dot sizes.
	const logW = m.rule.weights.map((w) => Math.log10(Math.max(w, 1e-30)));
	let lwMin = Infinity;
	let lwMax = -Infinity;
	for (const v of logW) {
		if (v < lwMin) lwMin = v;
		if (v > lwMax) lwMax = v;
	}
	const radius =
		lwMax - lwMin > 0.05
			? (lw: number) => 0.7 + 4.3 * ((lw - lwMin) / (lwMax - lwMin))
			: (_: number) => 2.8;

	ctx.fillStyle = "#2563eb";
	for (let i = 0; i < m.rule.nodes.length; i++) {
		const X = xpx(m.rule.nodes[i]);
		const Y = ypx(nodeYs[i]);
		const r = radius(logW[i]);
		ctx.beginPath();
		ctx.arc(X, Y, r, 0, 2 * Math.PI);
		ctx.fill();
	}

	ctx.restore();

	// Title.
	ctx.fillStyle = "#18181b";
	ctx.font = "600 12px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(m.title, cssW / 2, 16);

	// Rule value, plus error against closed form when available (x = 0).
	ctx.fillStyle = "#3f3f46";
	ctx.font = "11px ui-monospace, monospace";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(`K₁ ≈ ${m.value.toExponential(6)}`, x0 + 4, yt + 4);
	if (reference !== null) {
		const err = Math.abs(m.value - reference);
		ctx.fillText(
			`|err vs closed form| = ${err.toExponential(2)}`,
			x0 + 4,
			yt + 18,
		);
	}

	// X-axis label.
	ctx.fillStyle = "#52525b";
	ctx.font = "10px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillText("λ", (x0 + x1) / 2, cssH - 6);
}

const CONV_NS = [4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];
const N_REF = 1025;

/**
 * Convergence at a fixed x against a chosen reference value. Two callers:
 *   - x = 0 with closed-form K_1(0, 0) = 3√(2π)/128 (left panel, fixed)
 *   - x = slider with tanh-sinh n=1025 as reference (right panel)
 *
 * The right-side reference is named in the title; tanh-sinh's own curve
 * there will hit the noise floor early, reflecting that it has converged
 * to its high-N family member. Use the left panel as the calibration:
 * everything that's true on the right is also visible on the left (with
 * a closed-form anchor), so the reader can cross-check.
 */
function drawConvergence(
	canvas: HTMLCanvasElement,
	x: number,
	ref: number,
	titleSuffix: string,
): void {
	const errGL: number[] = [];
	const errGJ: number[] = [];
	const errTS: number[] = [];
	for (const n of CONV_NS) {
		const vGL = ruleValue(glOn01(n), (l) => fullW(l, x));
		const vGJ = ruleValue(gaussJacobi32(n), (l) => bareG(l, x));
		const vTS = ruleValue(tanhSinhRule(n % 2 === 0 ? n + 1 : n), (l) =>
			fullW(l, x),
		);
		errGL.push(Math.abs(vGL - ref));
		errGJ.push(Math.abs(vGJ - ref));
		errTS.push(Math.abs(vTS - ref));
	}
	const series: ConvergenceSeries[] = [
		{ label: "Gauss–Legendre", color: "#dc2626", ns: CONV_NS, errs: errGL },
		{ label: "Gauss–Jacobi(3/2)", color: "#2563eb", ns: CONV_NS, errs: errGJ },
		{ label: "tanh–sinh", color: "#0d9488", ns: CONV_NS, errs: errTS },
	];
	drawQuadConvergence(
		canvas,
		series,
		`Convergence at x = ${x.toFixed(2)}  ·  ${titleSuffix}`,
	);
}

/**
 * Mount the slider and return a `redraw()` that the caller (main.ts) invokes
 * whenever the Quadrature tab becomes visible, the window resizes while
 * the tab is active, or the Tool tab's σ / DTE inputs change (those feed
 * σ_total, which sets the integrand's x-argument).
 *
 * `getSmile` reads the live σ (ATM vol, ann %) and DTE; we derive
 * σ_total = σ / volScale(DTE) and use it to map the slider's k to the
 * K₁ kernel's natural argument x = k / σ_total.
 */
export function setupQuadraturePanel(
	getSmile: () => { sigma: number; dte: number },
): () => void {
	const slider = byId<HTMLInputElement>("quad-k");
	const kValEl = byId("quad-k-val");
	const derivedEl = byId("quad-x-derived");
	const nSlider = byId<HTMLInputElement>("quad-n");
	const nValEl = byId("quad-n-val");

	function update(): void {
		const { sigma, dte } = getSmile();
		const scale = volScale(dte);
		const sigmaTotal = sigma / scale;
		const k = parseFloat(slider.value);
		const x = k / sigmaTotal;
		const n = parseInt(nSlider.value, 10);
		kValEl.textContent = k.toFixed(3);
		nValEl.textContent = String(n);
		derivedEl.textContent = `→ x = k / σ_total = ${x.toFixed(3)}  (σ_total = ${sigmaTotal.toFixed(4)}, from σ = ${sigma.toFixed(2)}% · DTE = ${dte})`;
		const ref = x === 0 ? K1_PEAK_EXACT : null;
		for (const m of makeMethods(x, n)) {
			drawMethodPanel(byId<HTMLCanvasElement>(m.id), m, ref);
		}
		drawConvergence(
			byId<HTMLCanvasElement>("q-conv-atm"),
			0,
			K1_PEAK_EXACT,
			"reference: closed form 3√(2π)/128",
		);
		const refRight =
			x === 0
				? K1_PEAK_EXACT
				: ruleValue(tanhSinhRule(N_REF), (l) => fullW(l, x));
		const refLabelRight =
			x === 0
				? "reference: closed form 3√(2π)/128"
				: `reference: tanh–sinh n = ${N_REF}`;
		drawConvergence(
			byId<HTMLCanvasElement>("q-conv-x"),
			x,
			refRight,
			refLabelRight,
		);
	}

	let timer: number | undefined;
	const onInput = (): void => {
		if (timer) clearTimeout(timer);
		timer = window.setTimeout(update, 50);
	};
	slider.addEventListener("input", onInput);
	nSlider.addEventListener("input", onInput);

	return update;
}
