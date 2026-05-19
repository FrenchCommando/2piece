/**
 * Interactive page. Debounced inputs (DTE, sigma/beta/alpha/gamma, delta),
 * all computation in-browser via src/math. Four charts: implied-vol smile,
 * error vs PDE, local vol, and the Phi_BB^directed correction kernel.
 *
 * Model recompute (the expensive PDE) is debounced and cached; method
 * on/off toggles and drag-zoom only redraw the cached curves.
 */
import './style.css';
import { computeCurves, type ModelInputs, type ModelCurves } from '../math/model';
import { drawChart, type Series, type PlotMap } from './chart';
import examples from '../../examples/params.json';

interface Example extends ModelInputs {
  id: string;
  label: string;
  source: string;
}
const EXAMPLES = (examples as { examples: Example[] }).examples;

/** Round to 6 significant figures for display (calibrated params are noisy). */
function sig6(v: number): number {
  if (v === 0 || !isFinite(v)) return v;
  const d = Math.ceil(Math.log10(Math.abs(v)));
  const p = 6 - d;
  return Math.round(v * 10 ** p) / 10 ** p;
}

const FIELDS: { key: keyof ModelInputs; label: string; step: string }[] = [
  { key: 'dte', label: 'DTE (business days)', step: '1' },
  { key: 'sigma', label: 'σ (ATM, ann %)', step: '0.5' },
  { key: 'beta', label: 'β', step: '5' },
  { key: 'alpha', label: 'α', step: '50' },
  { key: 'gamma', label: 'γ', step: '1000' },
  { key: 'delta', label: 'δ (knot Δγ at k=0)', step: '10000' },
];

const METHODS = [
  { key: 'pde', label: 'PDE' },
  { key: 'bbf0', label: 'BBF0' },
  { key: 'phl1', label: 'PHL1' },
  { key: 'fourth', label: 'GHLOW2 / PHL1+corr' },
] as const;
type MethodKey = (typeof METHODS)[number]['key'];

const app = document.getElementById('app')!;
app.innerHTML = `
<header>
  <h1>Implied volatility at a cubic local-vol knot pinned at the money</h1>
  <nav class="tabs">
    <button id="tab-tool" class="tab active">Tool</button>
    <button id="tab-about" class="tab">About</button>
  </nav>
</header>
<main>
  <section id="view-tool">
    <p class="hint">Drag a box on any chart to zoom (both axes); double-click
    to reset. Use the checkboxes to hide methods (e.g. turn off BBF0 to see
    the rest). New to this? See the <b>About</b> tab.</p>
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
    <ul>
      <li><b>PDE</b> — Dupire forward equation, Rannacher start then
      Crank–Nicolson. Ground truth. At the deep wings the option time value
      underflows and implied vol is genuinely unrecoverable, so those points
      are dropped rather than faked.</li>
      <li><b>BBF0</b> — leading-order inverse harmonic mean
      <code>k / ∫₀ᵏ dy/σ_loc(y)</code> (Berestycki–Busca–Florent).</li>
      <li><b>PHL1</b> — BBF0 + the first-order <code>σ₁·T</code> heat-kernel
      correction (Henry-Labordère's expansion; explicit closed form from
      Gatheral et&nbsp;al., Thm.&nbsp;2.4).</li>
      <li><b>GHLOW2</b> — PHL1 + the Gatheral–Hsu–Laurence–Ouyang–Wang
      second-order <code>σ₂·T²</code> term.</li>
      <li><b>PHL1 + correction</b> — PHL1 plus the closed-form
      Brownian-bridge kernel that repairs the knot (knot case only).</li>
    </ul>

    <h2>The correction</h2>
    <p>To first order in the jump <code>δ</code>, with
    <code>x = k/σ_total</code> and the knot at ATM, the implied-vol error is
    a one-dimensional Brownian-bridge integral with peak
    <code>3√(2π)/128 ≈ 0.05875</code>:</p>
    <p class="eq"><code>Φ_BB(x,0) = ∫₀¹ (λ(1−λ))^{3/2} f(η) dλ,&nbsp;&nbsp;
    η = x·√(λ/(1−λ)),&nbsp;&nbsp;
    f(η) = (η³+3η)Φ(η) + (η²+2)φ(η)</code></p>
    <p>Subtracting the part PHL1 already moves (so it is not double-counted)
    gives the directed kernel; the applied correction in annualised % is
    <code>δ·σ_total³·Φ_BB^directed(k/σ_total, 0)</code> — exactly the gap
    panel&nbsp;4 plots.</p>

    <h2>Trust</h2>
    <p>Everything is computed in your browser. The math core is a 1:1 port
    of an independently-validated Python reference and is cross-checked
    against it in CI — BBF0/PHL1/GHLOW2 to 1e-6, the kernel to 1e-9, and the
    full knot model against the Dupire PDE. Example smile parameters are
    calibrated from real SPXW surfaces.</p>

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

const controls = document.getElementById('controls')!;
const inputs = new Map<keyof ModelInputs, HTMLInputElement>();
const state: ModelInputs = { ...EXAMPLES[0] } as unknown as ModelInputs;

function setInputs(): void {
  for (const [k, inp] of inputs) inp.value = String(sig6(state[k]));
}

const presetSrcEl = document.getElementById('preset-src')!;
function setPresetSrc(text: string, calibrated: boolean): void {
  presetSrcEl.textContent = text;
  presetSrcEl.classList.toggle('custom', !calibrated);
}

for (const f of FIELDS) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lab = document.createElement('label');
  lab.textContent = f.label;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.step = f.step;
  if (f.key === 'dte') inp.min = '1';
  if (f.key === 'sigma') inp.min = '0';
  inp.addEventListener('input', () => {
    let v = parseFloat(inp.value);
    if (isFinite(v)) {
      if (f.key === 'dte') v = Math.max(1, Math.round(v)); // DTE is a positive integer count of days
      // sigma is the ATM vol — it's the denominator everywhere (sigma_total =
      // sigma/scale, BBF0(0)=sigma); a non-positive value blows the maps up.
      if (f.key === 'sigma') v = Math.max(1e-6, v);
      state[f.key] = v;
      setPresetSrc('Custom parameters — not from a calibrated snapshot.', false);
      scheduleRecompute();
    }
  });
  inputs.set(f.key, inp);
  wrap.append(lab, inp);
  controls.append(wrap);
}

const presets = document.createElement('div');
presets.className = 'presets';
for (const ex of EXAMPLES) {
  const b = document.createElement('button');
  b.textContent = ex.label.split('—')[0].trim();
  b.title = ex.source;
  b.addEventListener('click', () => {
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

// Method on/off toggles.
const visible = new Map<MethodKey, boolean>(METHODS.map((m) => [m.key, true]));
const togglesEl = document.getElementById('toggles')!;
for (const m of METHODS) {
  const id = `t-${m.key}`;
  const wrap = document.createElement('label');
  wrap.className = 'toggle';
  wrap.htmlFor = id;
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = id;
  cb.checked = true;
  cb.addEventListener('change', () => {
    visible.set(m.key, cb.checked);
    draw();
  });
  wrap.append(cb, document.createTextNode(' ' + m.label));
  togglesEl.append(wrap);
}

// Per-chart 2D zoom box (drag a rectangle; double-click resets).
type Dom = [number, number] | null;
const zoomX = new Map<string, Dom>();
const zoomY = new Map<string, Dom>();
const drag = new Map<string, { x0: number; y0: number; x1: number; y1: number } | null>();

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
  document.getElementById('status')!.textContent =
    `σ_total = ${curves.sigmaTotal.toFixed(4)} (total vol), ` +
    `vol scale = ${curves.scale.toFixed(1)} · PDE + maps computed in ${ms} ms in-browser` +
    (curves.hasKnot ? ' · knot active at k=0' : ' · no knot (δ=0)');
  draw();
}

function vis(key: MethodKey, s: Series): Series[] {
  return visible.get(key) ? [s] : [];
}

function draw(): void {
  if (!curves) return;
  const c = curves;
  const knot = c.hasKnot;

  const ivSeries: Series[] = [
    ...vis('pde', { label: 'PDE (truth)', x: c.k, y: c.pde, color: '#18181b', width: 2 }),
    ...vis('bbf0', { label: 'BBF0', x: c.k, y: c.bbf0, color: '#a1a1aa', dash: [5, 4] }),
    ...vis('phl1', { label: 'PHL1', x: c.k, y: c.phl1, color: '#2563eb' }),
    ...vis(
      'fourth',
      knot
        ? { label: 'PHL1 + Φ_BB corr', x: c.k, y: c.phl1Corrected, color: '#dc2626', width: 1.8 }
        : { label: 'GHLOW2', x: c.k, y: c.ghlow2, color: '#ea580c' },
    ),
  ];
  drawChart(document.getElementById('c-iv') as HTMLCanvasElement, ivSeries, {
    title: 'Implied volatility smile',
    xlabel: 'log-moneyness k',
    ylabel: 'implied vol (ann %)',
    atmLine: knot,
    xDomain: zoomX.get('c-iv') ?? c.kValid,
    yDomain: zoomY.get('c-iv') ?? null,
  });

  const errOf = (y: number[]) => y.map((v, i) => (v - c.pde[i]) * 100);
  const errSeries: Series[] = [
    ...vis('bbf0', {
      label: 'BBF0 − PDE',
      x: c.k,
      y: errOf(c.bbf0),
      color: '#a1a1aa',
      dash: [5, 4],
    }),
    ...vis('phl1', { label: 'PHL1 − PDE', x: c.k, y: errOf(c.phl1), color: '#2563eb' }),
    ...vis(
      'fourth',
      knot
        ? { label: 'PHL1+corr − PDE', x: c.k, y: errOf(c.phl1Corrected), color: '#dc2626', width: 1.8 }
        : { label: 'GHLOW2 − PDE', x: c.k, y: errOf(c.ghlow2), color: '#ea580c' },
    ),
  ];
  drawChart(document.getElementById('c-err') as HTMLCanvasElement, errSeries, {
    title: 'Error vs PDE (basis points)',
    xlabel: 'log-moneyness k',
    ylabel: 'error (bps)',
    zeroLine: true,
    atmLine: knot,
    xDomain: zoomX.get('c-err') ?? c.kValid,
    yDomain: zoomY.get('c-err') ?? null,
  });

  drawChart(
    document.getElementById('c-loc') as HTMLCanvasElement,
    [{ label: 'σ_loc(k)', x: c.k, y: c.sigmaLoc, color: '#7c3aed', width: 1.8 }],
    {
      title: 'Local volatility σ_loc(k)' + (knot ? ' — C² knot at k=0' : ''),
      xlabel: 'log-moneyness k',
      ylabel: 'local vol (ann %)',
      atmLine: knot,
      xDomain: zoomX.get('c-loc') ?? null,
      yDomain: zoomY.get('c-loc') ?? null,
    },
  );

  // The applied ATM-knot correction in annualised %: exactly
  // PHL1+corr − PHL1 = δ·σ_total³·Φ_BB^directed(k/σ_total, 0).
  const corr = c.phl1Corrected.map((v, i) => v - c.phl1[i]);
  drawChart(
    document.getElementById('c-ker') as HTMLCanvasElement,
    [{ label: 'δ·σ_total³·Φ_BB^dir', x: c.k, y: corr, color: '#059669', width: 1.8 }],
    {
      title: knot
        ? 'ATM-knot implied-vol correction added to PHL1'
        : 'ATM-knot IV correction (δ = 0 ⇒ no knot, zero correction)',
      xlabel: 'log-moneyness k',
      ylabel: 'correction (annualised %)',
      zeroLine: true,
      atmLine: knot,
      xDomain: zoomX.get('c-ker') ?? c.kValid,
      yDomain: zoomY.get('c-ker') ?? null,
    },
  );

  // Rubber-band selection rectangle while dragging.
  for (const id of ['c-iv', 'c-err', 'c-loc', 'c-ker']) {
    const d = drag.get(id);
    if (!d) continue;
    const cv = document.getElementById(id) as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    const ax = Math.min(d.x0, d.x1);
    const bx = Math.max(d.x0, d.x1);
    const ay = Math.min(d.y0, d.y1);
    const by = Math.max(d.y0, d.y1);
    ctx.fillStyle = 'rgba(37,99,235,0.12)';
    ctx.fillRect(ax, ay, bx - ax, by - ay);
    ctx.strokeStyle = 'rgba(37,99,235,0.5)';
    ctx.strokeRect(ax, ay, bx - ax, by - ay);
  }
}

// 2D rubber-band box zoom + double-click reset, per chart.
for (const id of ['c-iv', 'c-err', 'c-loc', 'c-ker']) {
  const cv = document.getElementById(id) as HTMLCanvasElement;
  let down = false;
  const loc = (e: MouseEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  cv.addEventListener('mousedown', (e) => {
    down = true;
    const p = loc(e);
    drag.set(id, { x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  });
  cv.addEventListener('mousemove', (e) => {
    if (!down) return;
    const d = drag.get(id)!;
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
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    const toX = (pxv: number) =>
      plot.xMin +
      ((clamp(pxv, plot.px0, plot.px1) - plot.px0) / (plot.px1 - plot.px0)) *
        (plot.xMax - plot.xMin);
    const toY = (pyv: number) =>
      plot.yMin +
      ((plot.bottom - clamp(pyv, plot.top, plot.bottom)) / (plot.bottom - plot.top)) *
        (plot.yMax - plot.yMin);
    if (bx - ax >= 6) zoomX.set(id, [toX(ax), toX(bx)]);
    if (by - ay >= 6) zoomY.set(id, [toY(by), toY(ay)]); // canvas y is inverted
    draw();
  };
  cv.addEventListener('mouseup', finish);
  cv.addEventListener('mouseleave', (e) => {
    if (down) finish(e);
  });
  cv.addEventListener('dblclick', () => {
    zoomX.set(id, null);
    zoomY.set(id, null);
    draw();
  });
}

// Tab switching.
const tabTool = document.getElementById('tab-tool')!;
const tabAbout = document.getElementById('tab-about')!;
const viewTool = document.getElementById('view-tool')!;
const viewAbout = document.getElementById('view-about') as HTMLElement;
function showTab(tool: boolean): void {
  viewTool.hidden = !tool;
  viewAbout.hidden = tool;
  tabTool.classList.toggle('active', tool);
  tabAbout.classList.toggle('active', !tool);
  if (tool) draw(); // canvases may have been resized while hidden
}
tabTool.addEventListener('click', () => showTab(true));
tabAbout.addEventListener('click', () => showTab(false));

window.addEventListener('resize', () => {
  if (!viewTool.hidden) draw();
});
recompute();
