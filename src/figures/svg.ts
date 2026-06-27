/**
 * Deterministic SVG line-chart renderer for the committed figures. No deps,
 * no timestamps, fixed numeric formatting — so `npm run figures` produces
 * byte-identical output anyone can diff against the committed PNGs/SVGs.
 *
 * Plotting only; all numbers come from src/math (single source of truth).
 */
export interface Series {
	label: string;
	x: number[];
	y: number[];
	color: string;
	dash?: string;
	width?: number;
}
export interface AxisTick {
	value: number;
	label: string;
}
export interface PanelOpts {
	title: string;
	xlabel: string;
	ylabel: string;
	zeroLine?: boolean;
	atmLine?: boolean;
	/**
	 * Explicit ticks override the auto "nice number" axis and pin the domain to
	 * the tick extremes. Used for the log-log convergence figure (x = log₂ n
	 * labelled with n, y = log₁₀|error| labelled with powers of ten); callers
	 * pre-transform their series into the same coordinates.
	 */
	xTicks?: AxisTick[];
	yTicks?: AxisTick[];
}

const W = 760;
const PANEL_H = 300;
const PAD = { l: 66, r: 150, t: 34, b: 46 };
function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Heckbert "nice numbers" — same algorithm as the on-screen chart. */
function niceNum(x: number, round: boolean): number {
	const exp = Math.floor(Math.log10(x));
	const f = x / 10 ** exp;
	let nf: number;
	if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
	else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
	return nf * 10 ** exp;
}

function niceAxis(min: number, max: number, maxTicks = 6) {
	if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
		min -= 1;
		max += 1;
	}
	const range = niceNum(max - min, false);
	const step = niceNum(range / (maxTicks - 1), true);
	const lo = Math.floor(min / step) * step;
	const hi = Math.ceil(max / step) * step;
	const ticks: number[] = [];
	for (let v = lo; v <= hi + 0.5 * step; v += step)
		ticks.push(Math.round(v / step) * step);
	const decimals = Math.max(0, -Math.floor(Math.log10(step)));
	return { lo, hi, ticks, decimals };
}

function panel(series: Series[], o: PanelOpts, yTop: number): string {
	const live = series.filter((s) => s.y.some((v) => Number.isFinite(v)));
	let xMin = Infinity;
	let xMax = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;
	for (const s of live)
		for (let i = 0; i < s.x.length; i++) {
			const xv = s.x[i];
			const yv = s.y[i];
			if (xv < xMin) xMin = xv;
			if (xv > xMax) xMax = xv;
			if (Number.isFinite(yv)) {
				if (yv < yMin) yMin = yv;
				if (yv > yMax) yMax = yv;
			}
		}
	// Y domain + ticks: explicit ticks pin the domain to their extremes;
	// otherwise the auto "nice number" axis (with zero-line padding) is used.
	let yTicks: AxisTick[];
	if (o.yTicks) {
		yMin = Math.min(...o.yTicks.map((t) => t.value));
		yMax = Math.max(...o.yTicks.map((t) => t.value));
		yTicks = o.yTicks;
	} else {
		const padY = 0.06 * (yMax - yMin || 1);
		yMin -= padY;
		yMax += padY;
		if (o.zeroLine) {
			yMin = Math.min(yMin, 0);
			yMax = Math.max(yMax, 0);
		}
		const yA = niceAxis(yMin, yMax);
		yMin = yA.lo;
		yMax = yA.hi;
		yTicks = yA.ticks.map((v) => ({ value: v, label: v.toFixed(yA.decimals) }));
	}
	// X domain + ticks: explicit ticks pin the domain; otherwise keep the tight
	// data domain with "nice number" ticks drawn inside it (existing behaviour).
	let xTicks: AxisTick[];
	if (o.xTicks) {
		xMin = Math.min(...o.xTicks.map((t) => t.value));
		xMax = Math.max(...o.xTicks.map((t) => t.value));
		xTicks = o.xTicks;
	} else {
		const xA = niceAxis(xMin, xMax);
		xTicks = xA.ticks.map((v) => ({ value: v, label: v.toFixed(xA.decimals) }));
	}
	const x0 = PAD.l;
	const x1 = W - PAD.r;
	const y0 = yTop + PANEL_H - PAD.b;
	const y1 = yTop + PAD.t;
	const px = (x: number) => x0 + ((x - xMin) / (xMax - xMin)) * (x1 - x0);
	const py = (y: number) => y0 + ((y - yMin) / (yMax - yMin)) * (y1 - y0);

	const parts: string[] = [];
	parts.push(
		`<text x="${W / 2}" y="${yTop + 20}" text-anchor="middle" font-weight="600" font-size="14">${esc(o.title)}</text>`,
	);
	// grid + ticks (rounded "nice" values, or caller-supplied, within range)
	for (const t of yTicks) {
		if (t.value < yMin - 1e-9 || t.value > yMax + 1e-9) continue;
		const yy = py(t.value);
		parts.push(
			`<line x1="${x0}" y1="${yy}" x2="${x1}" y2="${yy}" stroke="${Math.abs(t.value) < 1e-12 ? "#a1a1aa" : "#ececf0"}"/>`,
		);
		parts.push(
			`<text x="${x0 - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#52525b">${esc(t.label)}</text>`,
		);
	}
	for (const t of xTicks) {
		if (t.value < xMin - 1e-12 || t.value > xMax + 1e-12) continue;
		const xx = px(t.value);
		parts.push(
			`<line x1="${xx}" y1="${y1}" x2="${xx}" y2="${y0}" stroke="#ececf0"/>`,
		);
		parts.push(
			`<text x="${xx}" y="${y0 + 16}" text-anchor="middle" font-size="11" fill="#52525b">${esc(t.label)}</text>`,
		);
	}
	if (o.zeroLine)
		parts.push(
			`<line x1="${x0}" y1="${py(0)}" x2="${x1}" y2="${py(0)}" stroke="#71717a"/>`,
		);
	if (o.atmLine && xMin <= 0 && xMax >= 0)
		parts.push(
			`<line x1="${px(0)}" y1="${y1}" x2="${px(0)}" y2="${y0}" stroke="#ef4444" stroke-dasharray="3 3"/>`,
		);

	let ly = y1 + 10;
	for (const s of live) {
		let d = "";
		let started = false;
		for (let i = 0; i < s.x.length; i++) {
			const yv = s.y[i];
			if (!Number.isFinite(yv)) {
				started = false;
				continue;
			}
			d += `${started ? "L" : "M"}${px(s.x[i]).toFixed(2)} ${py(yv).toFixed(2)}`;
			started = true;
		}
		const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : "";
		parts.push(
			`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 1.5}"${dash}/>`,
		);
		parts.push(
			`<line x1="${x1 + 12}" y1="${ly}" x2="${x1 + 34}" y2="${ly}" stroke="${s.color}" stroke-width="${s.width ?? 1.5}"${dash}/>`,
		);
		parts.push(
			`<text x="${x1 + 40}" y="${ly + 4}" font-size="11" fill="#3f3f46">${esc(s.label)}</text>`,
		);
		ly += 17;
	}
	parts.push(
		`<text x="${(x0 + x1) / 2}" y="${y0 + 38}" text-anchor="middle" font-size="11" fill="#52525b">${esc(o.xlabel)}</text>`,
	);
	parts.push(
		`<text transform="translate(18 ${(y0 + y1) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#52525b">${esc(o.ylabel)}</text>`,
	);
	return parts.join("\n");
}

/** Render one or two stacked panels to a standalone SVG string. */
export function renderSvg(
	panels: { series: Series[]; opts: PanelOpts }[],
): string {
	const H = PANEL_H * panels.length;
	const body = panels
		.map((p, i) => panel(p.series, p.opts, i * PANEL_H))
		.join("\n");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, sans-serif"><rect width="${W}" height="${H}" fill="#ffffff"/>\n${body}\n</svg>\n`;
}
