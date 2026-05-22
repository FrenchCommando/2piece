/**
 * Minimal dependency-free canvas line chart: multiple named series on shared
 * x, "nice" rounded axis ticks, legend, optional zero line and ATM marker,
 * and an optional x-domain (for drag-to-zoom). Hi-DPI aware.
 *
 * When an xDomain is given, y auto-scales to the data visible in that domain
 * so zooming x also reframes y (useful on the error panel).
 */
export interface Series {
	label: string;
	x: number[];
	y: number[];
	color: string;
	dash?: number[];
	width?: number;
}

export interface ChartOpts {
	title: string;
	xlabel: string;
	ylabel: string;
	zeroLine?: boolean;
	atmLine?: boolean; // vertical line at x=0 (the ATM knot)
	xDomain?: [number, number] | null;
	yDomain?: [number, number] | null;
}

const PAD = { l: 64, r: 150, t: 34, b: 44 };

/** Heckbert "nice numbers" for readable axis ticks. */
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

/** Plot mapping stashed on the canvas so zoom handlers can invert px -> x. */
export interface PlotMap {
	px0: number;
	px1: number;
	xMin: number;
	xMax: number;
	top: number;
	bottom: number;
	yMin: number;
	yMax: number;
}

import { getContext2D } from "../util";

export function drawChart(
	canvas: HTMLCanvasElement,
	series: Series[],
	opts: ChartOpts,
): void {
	const ctx = getContext2D(canvas);
	const dpr = window.devicePixelRatio || 1;
	const cssW = canvas.clientWidth;
	const cssH = canvas.clientHeight;
	canvas.width = Math.round(cssW * dpr);
	canvas.height = Math.round(cssH * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssW, cssH);

	const live = series.filter((s) => s.y.some((v) => Number.isFinite(v)));

	let xMin = Infinity;
	let xMax = -Infinity;
	for (const s of live)
		for (const xv of s.x) {
			if (xv < xMin) xMin = xv;
			if (xv > xMax) xMax = xv;
		}
	if (opts.xDomain) [xMin, xMax] = opts.xDomain;

	let yMin = Infinity;
	let yMax = -Infinity;
	for (const s of live)
		for (let i = 0; i < s.x.length; i++) {
			const xv = s.x[i];
			const yv = s.y[i];
			if (xv < xMin || xv > xMax || !Number.isFinite(yv)) continue;
			if (yv < yMin) yMin = yv;
			if (yv > yMax) yMax = yv;
		}
	if (opts.zeroLine && !opts.yDomain) {
		yMin = Math.min(yMin, 0);
		yMax = Math.max(yMax, 0);
	}
	const yAxis = niceAxis(
		opts.yDomain ? opts.yDomain[0] : yMin,
		opts.yDomain ? opts.yDomain[1] : yMax,
	);
	if (opts.yDomain) {
		[yMin, yMax] = opts.yDomain; // exact user box; ticks still "nice"
	} else {
		yMin = yAxis.lo;
		yMax = yAxis.hi;
	}
	const xAxis = niceAxis(xMin, xMax);

	const x0 = PAD.l;
	const x1 = cssW - PAD.r;
	const yb = cssH - PAD.b;
	const yt = PAD.t;
	const px = (x: number) => x0 + ((x - xMin) / (xMax - xMin)) * (x1 - x0);
	const py = (y: number) => yb - ((y - yMin) / (yMax - yMin)) * (yb - yt);

	(canvas as unknown as { __plot: PlotMap }).__plot = {
		px0: x0,
		px1: x1,
		xMin,
		xMax,
		top: yt,
		bottom: yb,
		yMin,
		yMax,
	};

	ctx.font = "11px system-ui, sans-serif";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	for (const yv of yAxis.ticks) {
		if (yv < yMin - 1e-9 || yv > yMax + 1e-9) continue;
		const yy = py(yv);
		ctx.strokeStyle = Math.abs(yv) < 1e-12 ? "#a1a1aa" : "#ececf0";
		ctx.beginPath();
		ctx.moveTo(x0, yy);
		ctx.lineTo(x1, yy);
		ctx.stroke();
		ctx.fillStyle = "#52525b";
		ctx.fillText(yv.toFixed(yAxis.decimals), x0 - 8, yy);
	}
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	for (const xv of xAxis.ticks) {
		if (xv < xMin - 1e-12 || xv > xMax + 1e-12) continue;
		const xx = px(xv);
		ctx.strokeStyle = "#ececf0";
		ctx.beginPath();
		ctx.moveTo(xx, yt);
		ctx.lineTo(xx, yb);
		ctx.stroke();
		ctx.fillStyle = "#52525b";
		ctx.fillText(xv.toFixed(xAxis.decimals), xx, yb + 6);
	}

	if (opts.zeroLine && 0 >= yMin && 0 <= yMax) {
		ctx.strokeStyle = "#71717a";
		ctx.beginPath();
		ctx.moveTo(x0, py(0));
		ctx.lineTo(x1, py(0));
		ctx.stroke();
	}
	if (opts.atmLine && xMin <= 0 && xMax >= 0) {
		ctx.strokeStyle = "#ef4444";
		ctx.setLineDash([3, 3]);
		ctx.beginPath();
		ctx.moveTo(px(0), yt);
		ctx.lineTo(px(0), yb);
		ctx.stroke();
		ctx.setLineDash([]);
	}

	// Clip series to the plot rect so zoom doesn't draw outside the axes.
	ctx.save();
	ctx.beginPath();
	ctx.rect(x0, yt, x1 - x0, yb - yt);
	ctx.clip();
	for (const s of live) {
		ctx.strokeStyle = s.color;
		ctx.lineWidth = s.width ?? 1.5;
		ctx.setLineDash(s.dash ?? []);
		ctx.beginPath();
		let started = false;
		for (let i = 0; i < s.x.length; i++) {
			const yv = s.y[i];
			if (!Number.isFinite(yv)) {
				started = false;
				continue;
			}
			const X = px(s.x[i]);
			const Y = py(yv);
			if (!started) {
				ctx.moveTo(X, Y);
				started = true;
			} else ctx.lineTo(X, Y);
		}
		ctx.stroke();
	}
	ctx.restore();
	ctx.setLineDash([]);

	ctx.fillStyle = "#18181b";
	ctx.font = "600 13px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(opts.title, cssW / 2, 20);
	ctx.font = "11px system-ui, sans-serif";
	ctx.fillStyle = "#52525b";
	ctx.fillText(opts.xlabel, (x0 + x1) / 2, cssH - 6);
	ctx.save();
	ctx.translate(14, (yt + yb) / 2);
	ctx.rotate(-Math.PI / 2);
	ctx.fillText(opts.ylabel, 0, 0);
	ctx.restore();

	ctx.font = "11px system-ui, sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	let ly = yt + 10;
	for (const s of live) {
		ctx.strokeStyle = s.color;
		ctx.lineWidth = s.width ?? 1.5;
		ctx.setLineDash(s.dash ?? []);
		ctx.beginPath();
		ctx.moveTo(x1 + 12, ly);
		ctx.lineTo(x1 + 34, ly);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.fillStyle = "#3f3f46";
		ctx.fillText(s.label, x1 + 40, ly);
		ly += 16;
	}
}
