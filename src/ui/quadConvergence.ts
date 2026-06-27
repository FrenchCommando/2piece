/**
 * Convergence chart for the quadrature panel. Different requirements from
 * the linear smile/error charts in `chart.ts`:
 *   - x-axis is log₂(n) internally, but labelled with the actual n (powers
 *     of two: 4, 8, 16, 32, …) so the reader doesn't have to translate.
 *   - y-axis is log₁₀ |error|, labelled with powers of ten (1e-4, 1e-8, …)
 *     for the same reason.
 *
 * Kept separate from `chart.ts` because the linear smile charts have no use
 * for either log axis and shouldn't pay the API surface cost.
 */
import { getContext2D } from "../util";

export interface ConvergenceSeries {
	label: string;
	color: string;
	/** Node count at each sample (linear domain — we log₂ it internally). */
	ns: number[];
	/** |error| at each sample (linear domain — we log₁₀ it internally). */
	errs: number[];
}

const PAD = { l: 60, r: 150, t: 34, b: 44 };
const ERR_FLOOR = 1e-18;

export function drawQuadConvergence(
	canvas: HTMLCanvasElement,
	series: ConvergenceSeries[],
	title: string,
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

	// Data domain in transformed coordinates: x = log₂(n), y = log₁₀(err).
	let xMin = Infinity;
	let xMax = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;
	for (const s of series) {
		for (let i = 0; i < s.ns.length; i++) {
			const lx = Math.log2(s.ns[i]);
			const ly = Math.log10(Math.max(ERR_FLOOR, s.errs[i]));
			if (lx < xMin) xMin = lx;
			if (lx > xMax) xMax = lx;
			if (ly < yMin) yMin = ly;
			if (ly > yMax) yMax = ly;
		}
	}
	// Round to integer powers of 2 / 10 on the axes for clean tick labels.
	xMin = Math.floor(xMin);
	xMax = Math.ceil(xMax);
	yMin = Math.floor(yMin) - 0.5;
	yMax = Math.ceil(yMax) + 0.5;

	const x0 = PAD.l;
	const x1 = cssW - PAD.r;
	const yb = cssH - PAD.b;
	const yt = PAD.t;
	const px = (lx: number): number =>
		x0 + ((lx - xMin) / (xMax - xMin)) * (x1 - x0);
	const py = (ly: number): number =>
		yb - ((ly - yMin) / (yMax - yMin)) * (yb - yt);

	// X-axis: one tick per integer log₂(n), labelled with n itself.
	ctx.font = "11px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	for (let lx = xMin; lx <= xMax; lx++) {
		const xx = px(lx);
		ctx.strokeStyle = "#ececf0";
		ctx.beginPath();
		ctx.moveTo(xx, yt);
		ctx.lineTo(xx, yb);
		ctx.stroke();
		ctx.fillStyle = "#52525b";
		ctx.fillText(String(2 ** lx), xx, yb + 6);
	}

	// Y-axis: one tick per integer log₁₀(err), labelled with the log value
	// itself (axis title carries the "log₁₀" part). Convention asymmetry vs
	// the x-axis: n is a count and reads better as 4/8/16/…, whereas errors
	// span many orders of magnitude and read better as -4/-8/-12.
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	for (let ly = Math.ceil(yMin); ly <= Math.floor(yMax); ly++) {
		const yy = py(ly);
		ctx.strokeStyle = "#ececf0";
		ctx.beginPath();
		ctx.moveTo(x0, yy);
		ctx.lineTo(x1, yy);
		ctx.stroke();
		ctx.fillStyle = "#52525b";
		ctx.fillText(String(ly), x0 - 8, yy);
	}

	// Clip series to the plot rect.
	ctx.save();
	ctx.beginPath();
	ctx.rect(x0, yt, x1 - x0, yb - yt);
	ctx.clip();
	for (const s of series) {
		ctx.strokeStyle = s.color;
		ctx.lineWidth = 1.8;
		ctx.beginPath();
		let started = false;
		for (let i = 0; i < s.ns.length; i++) {
			const X = px(Math.log2(s.ns[i]));
			const Y = py(Math.log10(Math.max(ERR_FLOOR, s.errs[i])));
			if (!started) {
				ctx.moveTo(X, Y);
				started = true;
			} else ctx.lineTo(X, Y);
		}
		ctx.stroke();
	}
	ctx.restore();

	// Title and axis labels.
	ctx.fillStyle = "#18181b";
	ctx.font = "600 13px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(title, cssW / 2, 20);
	ctx.font = "11px system-ui, sans-serif";
	ctx.fillStyle = "#52525b";
	ctx.fillText("node count n (log scale)", (x0 + x1) / 2, cssH - 6);
	ctx.save();
	ctx.translate(14, (yt + yb) / 2);
	ctx.rotate(-Math.PI / 2);
	ctx.fillText("log₁₀ |error|", 0, 0);
	ctx.restore();

	// Legend.
	ctx.font = "11px system-ui, sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	let ly = yt + 10;
	for (const s of series) {
		ctx.strokeStyle = s.color;
		ctx.lineWidth = 1.8;
		ctx.beginPath();
		ctx.moveTo(x1 + 12, ly);
		ctx.lineTo(x1 + 34, ly);
		ctx.stroke();
		ctx.fillStyle = "#3f3f46";
		ctx.fillText(s.label, x1 + 40, ly);
		ly += 16;
	}
}
