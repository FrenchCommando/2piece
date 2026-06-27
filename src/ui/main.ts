/**
 * Interactive page. Debounced inputs (DTE, sigma/beta/alpha/gamma, delta),
 * all computation in-browser via src/math. Four charts: implied-vol smile,
 * error vs PDE, local vol, and the K_1^directed correction kernel.
 *
 * Model recompute (the expensive PDE) is debounced and cached; method
 * on/off toggles and drag-zoom only redraw the cached curves.
 */
import "./style.css";
import examples from "../../examples/params.json";
import {
	computeCurves,
	type ModelCurves,
	type ModelInputs,
} from "../math/model";
import { byId, getContext2D, mapGet } from "../util";
import { drawChart, type PlotMap, type Series } from "./chart";
import { setupQuadraturePanel } from "./quadrature";

interface Example extends ModelInputs {
	id: string;
	label: string;
	source: string;
}
const EXAMPLES = (examples as { examples: Example[] }).examples;

/** Round to 6 significant figures for display (calibrated params are noisy). */
function sig6(v: number): number {
	if (v === 0 || !Number.isFinite(v)) return v;
	const d = Math.ceil(Math.log10(Math.abs(v)));
	const p = 6 - d;
	return Math.round(v * 10 ** p) / 10 ** p;
}

const FIELDS: { key: keyof ModelInputs; label: string; step: string }[] = [
	{ key: "dte", label: "DTE (business days)", step: "1" },
	{ key: "sigma", label: "σ (ATM, ann %)", step: "0.5" },
	{ key: "beta", label: "β", step: "5" },
	{ key: "alpha", label: "α", step: "50" },
	{ key: "gamma", label: "γ", step: "1000" },
	{ key: "delta", label: "δ (knot Δγ at k=0)", step: "10000" },
];

// Seven methods in T-order: PDE (truth), BBF0 (T^0), PHL1 (T^1),
// PHL1c (T^1 + T^{3/2}), GHLOW2 (T^2), GHLOW2c (T^2 + T^{3/2}, partial),
// GHLOW2cc (T^2 + T^{3/2}, extended). The 'c' suffix is one closed-form
// correction (the universal K_1^dir kernel that repairs sigma_1's
// slope kink); 'cc' is two (kernel + sigma_2's value-jump piece). Full
// word "correction" is used in prose when clarity wins (the bare "corr"
// abbreviation collides with correlation). Every 'c'/'cc' curve collapses
// to its baseline when delta = 0.
const METHODS = [
	{ key: "pde", label: "PDE" },
	{ key: "bbf0", label: "BBF0" },
	{ key: "phl1", label: "PHL1" },
	{ key: "phl1c", label: "PHL1c" },
	{ key: "ghlow2", label: "GHLOW2" },
	{ key: "ghlow2c", label: "GHLOW2c" },
	{ key: "ghlow2cc", label: "GHLOW2cc" },
] as const;
type MethodKey = (typeof METHODS)[number]["key"];

const app = byId("app");
app.innerHTML = `
<header>
  <h1>Implied volatility at a cubic local-vol knot pinned at the money</h1>
  <nav class="tabs">
    <button id="tab-tool" class="tab active">Tool</button>
    <button id="tab-quad" class="tab">Quadrature</button>
    <button id="tab-about" class="tab">About</button>
  </nav>
</header>
<main>
  <section id="view-tool">
    <p class="hint">Drag a box on any chart to zoom (both axes); double-click
    to reset. Use the checkboxes to toggle methods — BBF0 is off by default
    because it sits ~1% away and squashes the y-axis. New to this? See the
    <b>About</b> tab.</p>
    <div class="controls" id="controls"></div>
    <p class="preset-src" id="preset-src"></p>
    <div class="toggles" id="toggles"></div>
    <div class="grid">
      <div class="card"><canvas id="c-iv"></canvas></div>
      <div class="card"><canvas id="c-err"></canvas></div>
      <div class="card"><canvas id="c-loc"></canvas></div>
      <div class="card"><canvas id="c-ker"></canvas></div>
    </div>
    <p class="note" id="status"></p>
  </section>

  <section id="view-quad" hidden>
    <h2>Quadrature comparison for the K₁ bridge integral</h2>
    <p class="hint">
      K₁(x,&nbsp;0) is the one closed-form-free integral in the asymptotic
      family. The three rules below all approximate it; each draws the
      function it actually operates on (red curve) and the sample positions
      it picks (blue dots, radius ∝ log₁₀ weight, grey stem from the axis).
      Sweep <i>x</i> to see how each rule adapts. The left convergence plot
      is anchored at <i>x</i>&nbsp;=&nbsp;0 where the closed-form value
      K₁(0,&nbsp;0)&nbsp;=&nbsp;3√(2π)/128 is the truth; the right one
      tracks the slider and is anchored against tanh–sinh at
      <i>n</i>&nbsp;=&nbsp;1025, which we name explicitly because the whole
      point of numerical quadrature is that no closed-form reference exists.
    </p>
    <div class="toggles">
      <label>
        log-moneyness <i>k</i> =
        <input id="quad-k" type="range" min="-0.2" max="0.2" step="0.001" value="0.05"/>
        <span id="quad-k-val">0.050</span>
      </label>
      <label>
        <i>n</i> =
        <input id="quad-n" type="range" min="4" max="128" step="2" value="32"/>
        <span id="quad-n-val">32</span>
      </label>
      <span id="quad-x-derived"></span>
    </div>
    <div class="grid">
      <div class="card"><canvas id="q-gl"></canvas></div>
      <div class="card"><canvas id="q-gj"></canvas></div>
      <div class="card"><canvas id="q-ts"></canvas></div>
    </div>
    <div class="card"><canvas id="q-conv-x"></canvas></div>
    <div class="card"><canvas id="q-conv-atm"></canvas></div>

    <h3>Takeaway</h3>
    <p>K₁ is the only integral in the asymptotic family that genuinely
    needs quadrature — every other map (BBF0, σ₁, σ₂) is closed-form for
    a cubic σ_loc. Among the three rules:</p>
    <ul>
      <li>32-point <b>Gauss–Legendre</b> is the production choice:
      algebraic-rate convergence, robust across <i>x</i>, hits 1e-9 at
      <i>n</i>&nbsp;=&nbsp;32.</li>
      <li><b>Gauss–Jacobi(3/2,&nbsp;3/2)</b> looks tailored — it absorbs
      the (λ(1−λ))^{3/2} weight and is exact at <i>x</i>&nbsp;=&nbsp;0
      with just one node — but for <i>x</i>&nbsp;≠&nbsp;0 the residual
      f(η) blows up at λ&nbsp;→&nbsp;1 exactly where its nodes are
      sparsest, so it doesn't beat Legendre in practice.</li>
      <li><b>tanh–sinh</b> converges fastest in <i>n</i> but needs many
      more nodes to start; it's the right escape hatch if precision
      beyond 1e-12 is ever needed.</li>
    </ul>
  </section>

  <section id="view-about" hidden>
    <h2>What this is</h2>
    <p>The standard way to parametrise an implied-vol surface is to fit a
    local-vol cubic and push it through the leading-order <b>BBF0</b> map.
    BBF0 can calibrate essentially any smile — its weakness is not fit but
    <b>arbitrage consistency</b>: being leading-order, the implied vol it
    returns is not the model's true Dupire IV, so a quote-matching surface
    can still carry small static-arbitrage slack.</p>
    <p><b>PHL1</b> (next order) is much closer to the true Dupire IV and
    buys that arbitrage reassurance — but a single smooth cubic through
    PHL1 is rigid. Adding a <b>knot</b> would restore flexibility, except
    PHL1 develops a localised error at the knot: the surface is only C²
    there while PHL1's σ₁ term needs C³ (BBF0, a harmonic-mean integral, is
    insensitive to the knot and has no knot-specific error).</p>
    <p>This tool removes that error in closed form <b>for a knot pinned
    at-the-money</b> (<code>k = 0</code>), making
    "piecewise-cubic-with-ATM-knot + PHL1" a usable parametrisation that
    keeps PHL1's arbitrage reassurance while regaining calibration
    flexibility. Pinning the knot to ATM is what makes the correction
    bounded with no truncation hack.</p>

    <h2>Setup</h2>
    <p>Local volatility is one cubic in log-moneyness
    <code>k = log(K/F)</code>, annualised %:</p>
    <p class="eq"><code>σ_loc(k) = σ + βk + αk² + γk³</code></p>
    <p>An at-the-money knot adds a one-sided jump <code>δ</code> in the cubic
    coefficient (the <code>k ≤ 0</code> side is untouched):</p>
    <p class="eq"><code>σ_loc(k) = σ + βk + αk² + γk³ + δ·k³·H(k)</code></p>
    <p><code>σ_loc</code> stays C²-continuous at <code>k = 0</code>; only the
    third derivative jumps. That single broken derivative is what the smooth
    asymptotics miss.</p>

    <h2>The methods</h2>
    <p>The four closed forms sit on a time-ordering at the ATM knot —
    <code>T⁰</code> (BBF0), <code>T¹</code> (PHL1), <code>T^{3/2}</code>
    (this paper's knot correction), <code>T²</code> (GHLOW2's σ₂) — so
    the correction lives between PHL1 and GHLOW2 and can be stacked on
    either baseline.</p>
    <ul>
      <li><b>PDE</b> — Dupire forward equation, Rannacher start then
      Crank–Nicolson. Ground truth. At the deep wings the option time value
      underflows and implied vol is genuinely unrecoverable, so those points
      are dropped rather than faked.</li>
      <li><b>BBF0</b> — leading-order inverse harmonic mean
      <code>k / ∫₀ᵏ dy/σ_loc(y)</code> (Berestycki–Busca–Florent).</li>
      <li><b>PHL1</b> — BBF0 + the first-order <code>σ₁</code> heat-kernel
      correction (Henry-Labordère's expansion; explicit closed form from
      Gatheral et&nbsp;al., Thm.&nbsp;2.4).</li>
      <li><b>PHL1c</b> — PHL1 plus the closed-form first-order Duhamel
      kernel that repairs the knot. Collapses to PHL1 when
      <code>δ = 0</code>.</li>
      <li><b>GHLOW2c</b> — GHLOW2 with the same universal K₁^dir kernel
      that PHL1c uses, equivalently <code>PHL1c + σ₂</code>. Repairs the
      σ₁ slope kink at the knot but still carries the analytic value jump
      from σ₂(0)'s δ-variation. Collapses to GHLOW2 when
      <code>δ = 0</code>.</li>
      <li><b>GHLOW2cc</b> — GHLOW2 with the extended directed kernel that
      additionally subtracts σ₂'s δ-variation. Closes both the σ₁ slope
      kink and the σ₂ value jump at <code>k=0</code>. Collapses to GHLOW2
      when <code>δ = 0</code>.</li>
    </ul>

    <h2>The correction</h2>
    <p>To first order in the jump <code>δ</code>, with
    <code>x = k/σ</code> and the knot at ATM (<code>w = 0</code>), the
    implied-vol error is the first-order Duhamel kernel
    <code>K₁(x, w)</code> — a one-dimensional bridge integral with peak
    <code>3√(2π)/128 ≈ 0.05875</code>:</p>
    <p class="eq"><code>K₁(x, w) = ∫₀¹ (λ(1−λ))^{3/2} f(η) dλ,&nbsp;&nbsp;
    η = [λx − (1−λ)w] / √(λ(1−λ)),&nbsp;&nbsp;
    f(η) = (η³+3η)Φ(η) + (η²+2)φ(η)</code></p>
    <p>Subtracting the part PHL1 already moves (so it is not double-counted)
    gives the directed kernel <code>K₁^dir</code>; the applied PHL1
    correction, in annualised %, is
    <code>R^(3,1)_1(k/σ, 0) = δ·σ³·K₁^dir(k/σ, 0)</code> — exactly the
    solid-green curve in panel&nbsp;4 (and the same gap GHLOW2c adds to
    GHLOW2, since the kernel is universal). GHLOW2 carries one additional
    δ-variation, <code>σ₂</code>'s, so the <i>extended</i> directed
    kernel <code>K₁^ext</code> subtracts that piece as well
    (cubic-parameter-dependent — not universal in <code>x</code> the way
    PHL1's is — but still bounded thanks to <code>w = 0</code>); adding
    <code>R^(3,1)_2(k/σ, 0) = δ·σ³·K₁^ext(k/σ, 0)</code> on top of
    GHLOW2 yields GHLOW2cc, the dashed-purple curve in panel&nbsp;4.</p>

    <h2>Trust</h2>
    <p>Everything is computed in your browser. The math core is checked
    in CI against a committed numerical fixture — BBF0/PHL1/GHLOW2 to
    1e-6, the kernel to 1e-9 — and the full knot-case model is checked
    against the Dupire PDE (an independent operator and discretisation).
    Example smile parameters are calibrated from real SPXW surfaces.</p>

    <h2>Links</h2>
    <ul>
      <li><a href="https://frenchcommando.github.io/2piece/">Interactive
      page</a> (this tool — canonical URL)</li>
      <li><a href="https://github.com/FrenchCommando/2piece">Source
      repository</a> (self-contained; README has the full formulas)</li>
      <li>Research note (PDF): built by GitHub Actions — the
      <code>2piece-paper</code> artifact of the latest <i>Build paper</i>
      run</li>
    </ul>

    <h2>Credits</h2>
    <p>Market data for the calibrated example smiles: <b>ThetaData</b>.</p>
    <p>Released under the MIT License.</p>
  </section>
</main>`;

const controls = byId("controls");
const inputs = new Map<keyof ModelInputs, HTMLInputElement>();
const state: ModelInputs = { ...EXAMPLES[0] } as unknown as ModelInputs;

function setInputs(): void {
	for (const [k, inp] of inputs) inp.value = String(sig6(state[k]));
}

const presetSrcEl = byId("preset-src");
function setPresetSrc(text: string, calibrated: boolean): void {
	presetSrcEl.textContent = text;
	presetSrcEl.classList.toggle("custom", !calibrated);
}

for (const f of FIELDS) {
	const wrap = document.createElement("div");
	wrap.className = "field";
	const lab = document.createElement("label");
	lab.textContent = f.label;
	const inp = document.createElement("input");
	inp.type = "number";
	inp.step = f.step;
	if (f.key === "dte") inp.min = "1";
	if (f.key === "sigma") inp.min = "0";
	inp.addEventListener("input", () => {
		let v = parseFloat(inp.value);
		if (Number.isFinite(v)) {
			if (f.key === "dte") v = Math.max(1, Math.round(v)); // DTE is a positive integer count of days
			// sigma is the ATM vol — it's the denominator everywhere (sigma_total =
			// sigma/scale, BBF0(0)=sigma); a non-positive value blows the maps up.
			if (f.key === "sigma") v = Math.max(1e-6, v);
			state[f.key] = v;
			setPresetSrc(
				"Custom parameters — not from a calibrated snapshot.",
				false,
			);
			scheduleRecompute();
		}
	});
	inputs.set(f.key, inp);
	wrap.append(lab, inp);
	controls.append(wrap);
}

const presets = document.createElement("div");
presets.className = "presets";
for (const ex of EXAMPLES) {
	const b = document.createElement("button");
	b.textContent = ex.label.split("—")[0].trim();
	b.title = ex.source;
	b.addEventListener("click", () => {
		state.dte = ex.dte;
		state.sigma = ex.sigma;
		state.beta = ex.beta;
		state.alpha = ex.alpha;
		state.gamma = ex.gamma;
		state.delta = ex.delta;
		setInputs();
		setPresetSrc(`Calibrated snapshot: ${ex.source}`, true);
		scheduleRecompute();
	});
	presets.append(b);
}
controls.append(presets);
setInputs();
setPresetSrc(`Calibrated snapshot: ${EXAMPLES[0].source}`, true);

// Method on/off toggles. The checkbox is the source of truth for visibility.
const toggles = new Map<MethodKey, HTMLInputElement>();
const togglesEl = byId("toggles");
for (const m of METHODS) {
	const id = `t-${m.key}`;
	const wrap = document.createElement("label");
	wrap.className = "toggle";
	wrap.htmlFor = id;
	const cb = document.createElement("input");
	cb.type = "checkbox";
	cb.id = id;
	cb.checked = m.key !== "bbf0";
	cb.addEventListener("change", draw);
	toggles.set(m.key, cb);
	wrap.append(cb, document.createTextNode(` ${m.label}`));
	togglesEl.append(wrap);
}

// Per-chart 2D zoom box (drag a rectangle; double-click resets).
type Dom = [number, number] | null;
const zoomX = new Map<string, Dom>();
const zoomY = new Map<string, Dom>();
const drag = new Map<
	string,
	{ x0: number; y0: number; x1: number; y1: number } | null
>();

let timer: number | undefined;
function scheduleRecompute(): void {
	if (timer) clearTimeout(timer);
	timer = window.setTimeout(recompute, 130);
}

let curves: ModelCurves | null = null;

function recompute(): void {
	const t0 = performance.now();
	curves = computeCurves(state, 321, { nGrid: 1601, nSteps: 1400 });
	const ms = (performance.now() - t0).toFixed(0);
	byId("status").textContent =
		`σ_total = ${curves.sigmaTotal.toFixed(4)} (total vol), ` +
		`vol scale = ${curves.scale.toFixed(1)} · PDE + maps computed in ${ms} ms in-browser` +
		(curves.hasKnot ? " · knot active at k=0" : " · no knot (δ=0)");
	draw();
	// σ / DTE feed the quadrature panel's σ_total (k → x mapping); keep it in
	// sync even when its tab is hidden — when the user switches tabs the
	// canvases are already populated with the right values.
	redrawQuadPanel?.();
}

function vis(key: MethodKey, s: Series): Series[] {
	return toggles.get(key)?.checked ? [s] : [];
}

function draw(): void {
	if (!curves) return;
	const c = curves;
	const knot = c.hasKnot;

	const ivSeries: Series[] = [
		...vis("pde", {
			label: "PDE (truth)",
			x: c.k,
			y: c.pde,
			color: "#18181b",
			width: 2,
		}),
		...vis("bbf0", {
			label: "BBF0",
			x: c.k,
			y: c.bbf0,
			color: "#a1a1aa",
			dash: [5, 4],
		}),
		...vis("phl1", { label: "PHL1", x: c.k, y: c.phl1, color: "#2563eb" }),
		...vis("phl1c", {
			label: "PHL1c",
			x: c.k,
			y: c.phl1c,
			color: "#dc2626",
			width: 1.8,
		}),
		...vis("ghlow2", {
			label: "GHLOW2",
			x: c.k,
			y: c.ghlow2,
			color: "#0d9488",
		}),
		...vis("ghlow2c", {
			label: "GHLOW2c",
			x: c.k,
			y: c.ghlow2c,
			color: "#f59e0b",
			width: 1.8,
		}),
		...vis("ghlow2cc", {
			label: "GHLOW2cc",
			x: c.k,
			y: c.ghlow2cc,
			color: "#9333ea",
			width: 1.8,
		}),
	];
	drawChart(byId<HTMLCanvasElement>("c-iv"), ivSeries, {
		title: "Implied volatility smile",
		xlabel: "log-moneyness k",
		ylabel: "implied vol (ann %)",
		atmLine: knot,
		xDomain: zoomX.get("c-iv") ?? c.kValid,
		yDomain: zoomY.get("c-iv") ?? null,
	});

	const errOf = (y: number[]) => y.map((v, i) => (v - c.pde[i]) * 100);
	const errSeries: Series[] = [
		...vis("bbf0", {
			label: "BBF0 − PDE",
			x: c.k,
			y: errOf(c.bbf0),
			color: "#a1a1aa",
			dash: [5, 4],
		}),
		...vis("phl1", {
			label: "PHL1 − PDE",
			x: c.k,
			y: errOf(c.phl1),
			color: "#2563eb",
		}),
		...vis("phl1c", {
			label: "PHL1c − PDE",
			x: c.k,
			y: errOf(c.phl1c),
			color: "#dc2626",
			width: 1.8,
		}),
		...vis("ghlow2", {
			label: "GHLOW2 − PDE",
			x: c.k,
			y: errOf(c.ghlow2),
			color: "#0d9488",
		}),
		...vis("ghlow2c", {
			label: "GHLOW2c − PDE",
			x: c.k,
			y: errOf(c.ghlow2c),
			color: "#f59e0b",
			width: 1.8,
		}),
		...vis("ghlow2cc", {
			label: "GHLOW2cc − PDE",
			x: c.k,
			y: errOf(c.ghlow2cc),
			color: "#9333ea",
			width: 1.8,
		}),
	];
	drawChart(byId<HTMLCanvasElement>("c-err"), errSeries, {
		title: "Error vs PDE (basis points)",
		xlabel: "log-moneyness k",
		ylabel: "error (bps)",
		zeroLine: true,
		atmLine: knot,
		xDomain: zoomX.get("c-err") ?? c.kValid,
		yDomain: zoomY.get("c-err") ?? null,
	});

	drawChart(
		byId<HTMLCanvasElement>("c-loc"),
		[
			{
				label: "σ_loc(k)",
				x: c.k,
				y: c.sigmaLoc,
				color: "#7c3aed",
				width: 1.8,
			},
		],
		{
			title: `Local volatility σ_loc(k)${knot ? " — C² knot at k=0" : ""}`,
			xlabel: "log-moneyness k",
			ylabel: "local vol (ann %)",
			atmLine: knot,
			xDomain: zoomX.get("c-loc") ?? null,
			yDomain: zoomY.get("c-loc") ?? null,
		},
	);

	// Two pieces of the ATM-knot correction, in annualised %:
	//   universalSpike  = PHL1c − PHL1   = GHLOW2c − GHLOW2  (the universal
	//                                       directed kernel itself)
	//   extensionSpike  = GHLOW2cc − GHLOW2c  (the σ_2 extension piece — the
	//                                       small, (β,α,γ)-parametric bit the
	//                                       extended kernel adds on top of
	//                                       the universal one)
	// The extension lives only on k > 0 and decays to zero on the wings as
	// the σ_2 piece is clipped at zero.
	const universalSpike = c.phl1c.map((v, i) => v - c.phl1[i]);
	const extensionSpike = c.ghlow2cc.map((v, i) => v - c.ghlow2c[i]);
	drawChart(
		byId<HTMLCanvasElement>("c-ker"),
		[
			{
				label: "R^(3,1)_1 = δ·σ³·K₁^dir",
				x: c.k,
				y: universalSpike,
				color: "#059669",
				width: 1.8,
			},
			{
				label: "extension (σ₂ piece)",
				x: c.k,
				y: extensionSpike,
				color: "#9333ea",
				width: 1.8,
				dash: [6, 3],
			},
		],
		{
			title: knot
				? "ATM-knot IV correction: universal kernel + σ₂ extension"
				: "ATM-knot IV corrections (δ = 0 ⇒ no knot, zero correction)",
			xlabel: "log-moneyness k",
			ylabel: "correction (annualised %)",
			zeroLine: true,
			atmLine: knot,
			xDomain: zoomX.get("c-ker") ?? c.kValid,
			yDomain: zoomY.get("c-ker") ?? null,
		},
	);

	// Rubber-band selection rectangle while dragging.
	for (const id of ["c-iv", "c-err", "c-loc", "c-ker"]) {
		const d = drag.get(id);
		if (!d) continue;
		const cv = byId<HTMLCanvasElement>(id);
		const ctx = getContext2D(cv);
		const ax = Math.min(d.x0, d.x1);
		const bx = Math.max(d.x0, d.x1);
		const ay = Math.min(d.y0, d.y1);
		const by = Math.max(d.y0, d.y1);
		ctx.fillStyle = "rgba(37,99,235,0.12)";
		ctx.fillRect(ax, ay, bx - ax, by - ay);
		ctx.strokeStyle = "rgba(37,99,235,0.5)";
		ctx.strokeRect(ax, ay, bx - ax, by - ay);
	}
}

// 2D rubber-band box zoom + double-click reset, per chart.
for (const id of ["c-iv", "c-err", "c-loc", "c-ker"]) {
	const cv = byId<HTMLCanvasElement>(id);
	let down = false;
	const loc = (e: MouseEvent) => {
		const r = cv.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	};
	cv.addEventListener("mousedown", (e) => {
		down = true;
		const p = loc(e);
		drag.set(id, { x0: p.x, y0: p.y, x1: p.x, y1: p.y });
	});
	cv.addEventListener("mousemove", (e) => {
		if (!down) return;
		const d = mapGet(drag, id);
		if (!d) return;
		const p = loc(e);
		drag.set(id, { x0: d.x0, y0: d.y0, x1: p.x, y1: p.y });
		requestAnimationFrame(draw);
	});
	const finish = (e: MouseEvent) => {
		if (!down) return;
		down = false;
		const d = drag.get(id);
		drag.set(id, null);
		if (!d) return draw();
		const plot = (cv as unknown as { __plot?: PlotMap }).__plot;
		if (!plot) return draw();
		const p = loc(e);
		const ax = Math.min(d.x0, p.x);
		const bx = Math.max(d.x0, p.x);
		const ay = Math.min(d.y0, p.y);
		const by = Math.max(d.y0, p.y);
		// Too small in both dims → treat as a click, not a zoom.
		if (bx - ax < 6 && by - ay < 6) return draw();
		const clamp = (v: number, lo: number, hi: number) =>
			Math.min(Math.max(v, lo), hi);
		const toX = (pxv: number) =>
			plot.xMin +
			((clamp(pxv, plot.px0, plot.px1) - plot.px0) / (plot.px1 - plot.px0)) *
				(plot.xMax - plot.xMin);
		const toY = (pyv: number) =>
			plot.yMin +
			((plot.bottom - clamp(pyv, plot.top, plot.bottom)) /
				(plot.bottom - plot.top)) *
				(plot.yMax - plot.yMin);
		if (bx - ax >= 6) zoomX.set(id, [toX(ax), toX(bx)]);
		if (by - ay >= 6) zoomY.set(id, [toY(by), toY(ay)]); // canvas y is inverted
		draw();
	};
	cv.addEventListener("mouseup", finish);
	cv.addEventListener("mouseleave", (e) => {
		if (down) finish(e);
	});
	cv.addEventListener("dblclick", () => {
		zoomX.set(id, null);
		zoomY.set(id, null);
		draw();
	});
}

// Tab switching.
type TabKey = "tool" | "quad" | "about";
const tabs: { key: TabKey; button: HTMLElement; view: HTMLElement }[] = [
	{ key: "tool", button: byId("tab-tool"), view: byId("view-tool") },
	{ key: "quad", button: byId("tab-quad"), view: byId("view-quad") },
	{ key: "about", button: byId("tab-about"), view: byId("view-about") },
];
function showTab(active: TabKey): void {
	for (const t of tabs) {
		t.view.hidden = t.key !== active;
		t.button.classList.toggle("active", t.key === active);
	}
	// Canvases that were hidden have zero client dimensions; redraw on show.
	if (active === "tool") draw();
	if (active === "quad") redrawQuadPanel();
}
for (const t of tabs) t.button.addEventListener("click", () => showTab(t.key));

const redrawQuadPanel = setupQuadraturePanel(() => ({
	sigma: state.sigma,
	dte: state.dte,
}));
window.addEventListener("resize", () => {
	const active = tabs.find((t) => !t.view.hidden);
	if (active?.key === "tool") draw();
	if (active?.key === "quad") redrawQuadPanel();
});
recompute();
redrawQuadPanel();
