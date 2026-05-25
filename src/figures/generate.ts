/**
 * Regenerate the committed figures from the TS math core. Deterministic SVG
 * (full-resolution PDE) — `npm run figures` then `git diff` lets a cloner
 * confirm the images are identical. Run: `npx tsx src/figures/generate.ts`.
 */
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import examples from "../../examples/params.json";
import { K1_PEAK } from "../math/kernel";
import { computeCurves, type ModelInputs } from "../math/model";
import { findOrThrow } from "../util";
import { renderSvg, type Series } from "./svg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "figures");
mkdirSync(OUT, { recursive: true });

// Pending PDF stream flushes; awaited at end-of-script so the process
// doesn't exit before all writes complete.
const pendingPdfs: Promise<void>[] = [];

// SVG units are CSS pixels (96 DPI); PDF units are points (72 DPI). Without
// this factor the PDF page is sized to the raw px count, but svg-to-pdfkit
// only fills 72/96 = 75 % of it — leaving 25 % blank on right and bottom.
const PX_TO_PT = 72 / 96;

/**
 * Write both `<name>.svg` (text, diffable, web preview) and `<name>.pdf`
 * (binary, embedded into the paper by `\includegraphics{<name>}`). pdflatex
 * picks the PDF over the SVG by extension-search precedence, so a single
 * pipeline keeps web and paper artifacts in lockstep — no external
 * SVG→PDF converter (rsvg, inkscape) needed on contributors' machines.
 */
function writeFigure(name: string, svg: string): void {
	writeFileSync(join(OUT, `${name}.svg`), svg);
	const widthMatch = /\bwidth="(\d+)"/.exec(svg);
	const heightMatch = /\bheight="(\d+)"/.exec(svg);
	if (!widthMatch || !heightMatch) {
		throw new Error(`Cannot parse SVG dimensions for ${name}`);
	}
	const wPt = Number.parseInt(widthMatch[1], 10) * PX_TO_PT;
	const hPt = Number.parseInt(heightMatch[1], 10) * PX_TO_PT;
	// Fixed epoch dates so byte-identical SVGs produce byte-identical PDFs —
	// otherwise pdfkit stamps CreationDate/ModDate at construction and every
	// `npm run figures` shows a dirty `git diff` even when the figure didn't
	// actually change.
	const doc = new PDFDocument({
		size: [wPt, hPt],
		margin: 0,
		info: { CreationDate: new Date(0), ModDate: new Date(0) },
	});
	const stream = createWriteStream(join(OUT, `${name}.pdf`));
	doc.pipe(stream);
	SVGtoPDF(doc, svg, 0, 0, { width: wPt, height: hPt });
	doc.end();
	pendingPdfs.push(
		new Promise<void>((resolve, reject) => {
			stream.on("finish", () => resolve());
			stream.on("error", reject);
		}),
	);
}

const EX = (
	examples as { examples: (ModelInputs & { id: string; label: string })[] }
).examples;
const byId = (id: string) =>
	findOrThrow(
		EX,
		(e) => (e as unknown as { id: string }).id === id,
		`no example ${id}`,
	);

const FULL = { nGrid: 3201, nSteps: 3200 };

function smileFig(
	file: string,
	title: string,
	inp: ModelInputs,
	knot: boolean,
): void {
	const c = computeCurves(inp, 1601, FULL);
	// No knot: 4-curve set (BBF0/PHL1/GHLOW2). With knot: 7-curve set adding
	// PHL1c, GHLOW2c (PHL1c-style universal kernel) and GHLOW2cc (extended
	// kernel that also closes σ_2's value jump) alongside both baselines.
	const iv: Series[] = [
		{ label: "PDE (truth)", x: c.k, y: c.pde, color: "#18181b", width: 2 },
		{ label: "BBF0", x: c.k, y: c.bbf0, color: "#a1a1aa", dash: "5 4" },
		{ label: "PHL1", x: c.k, y: c.phl1, color: "#2563eb" },
		...(knot
			? [
					{
						label: "PHL1c",
						x: c.k,
						y: c.phl1c,
						color: "#dc2626",
						width: 1.8,
					} as Series,
					{ label: "GHLOW2", x: c.k, y: c.ghlow2, color: "#0d9488" } as Series,
					{
						label: "GHLOW2c",
						x: c.k,
						y: c.ghlow2c,
						color: "#f59e0b",
						width: 1.8,
					} as Series,
					{
						label: "GHLOW2cc",
						x: c.k,
						y: c.ghlow2cc,
						color: "#9333ea",
						width: 1.8,
					} as Series,
				]
			: [{ label: "GHLOW2", x: c.k, y: c.ghlow2, color: "#ea580c" } as Series]),
	];
	const e = (y: number[]) => y.map((v, i) => (v - c.pde[i]) * 100);
	const err: Series[] = [
		{
			label: "BBF0",
			x: c.k,
			y: e(c.bbf0),
			color: "#a1a1aa",
			dash: "5 4",
		},
		{ label: "PHL1", x: c.k, y: e(c.phl1), color: "#2563eb" },
		...(knot
			? [
					{
						label: "PHL1c",
						x: c.k,
						y: e(c.phl1c),
						color: "#dc2626",
						width: 1.8,
					} as Series,
					{
						label: "GHLOW2",
						x: c.k,
						y: e(c.ghlow2),
						color: "#0d9488",
					} as Series,
					{
						label: "GHLOW2c",
						x: c.k,
						y: e(c.ghlow2c),
						color: "#f59e0b",
						width: 1.8,
					} as Series,
					{
						label: "GHLOW2cc",
						x: c.k,
						y: e(c.ghlow2cc),
						color: "#9333ea",
						width: 1.8,
					} as Series,
				]
			: [
					{
						label: "GHLOW2",
						x: c.k,
						y: e(c.ghlow2),
						color: "#ea580c",
					} as Series,
				]),
	];
	const panels = [
		{
			series: iv,
			opts: {
				title,
				xlabel: "log-moneyness k",
				ylabel: "implied vol (ann %)",
				atmLine: knot,
			},
		},
		{
			series: err,
			opts: {
				title: "Error vs PDE (basis points)",
				xlabel: "log-moneyness k",
				ylabel: "error (bps)",
				zeroLine: true,
				atmLine: knot,
			},
		},
	];
	// BBF0's error dwarfs the others and squashes the y-axis; a third panel
	// without BBF0 makes the corrected / uncorrected comparison legible —
	// for both the no-knot and knot cases.
	panels.push({
		series: err.filter((s) => !s.label.startsWith("BBF0")),
		opts: {
			title: knot
				? "Error vs PDE — BBF0 excluded (PHL1 / PHL1c vs GHLOW2 / GHLOW2c / GHLOW2cc)"
				: "Error vs PDE — BBF0 excluded (PHL1 vs GHLOW2)",
			xlabel: "log-moneyness k",
			ylabel: "error (bps)",
			zeroLine: true,
			atmLine: knot,
		},
	});
	const svg = renderSvg(panels);
	writeFigure(file, svg);
	const maxBbf =
		Math.max(
			...c.bbf0
				.map((v, i) => Math.abs(v - c.pde[i]))
				.filter((d) => Number.isFinite(d)),
		) * 100;
	// eslint-disable-next-line no-console
	console.log(`${file}: max|BBF0−PDE| = ${maxBbf.toFixed(1)} bps`);
}

// F1 happy, F2 concave (no knot): PDE/BBF0/PHL1/GHLOW2.
smileFig(
	"F1_happy",
	"Happy case — SPXW 2025-03-10 DTE 1 (monotone skew)",
	byId("happy"),
	false,
);
smileFig(
	"F2_concave",
	"Concave case — SPXW 2025-03-10 DTE 3 (concave smile)",
	byId("concave"),
	false,
);
// F3 unhappy fake knot at k=0: PDE/BBF0/PHL1/PHL1c/GHLOW2/GHLOW2c/GHLOW2cc.
smileFig(
	"F3_knot",
	"Unhappy case — fake ATM knot at k=0",
	byId("knot"),
	true,
);

// F4: the universal kernel and the σ_2 extension piece for the knot example.
//   - universal K_1^dir = PHL1c − PHL1 = GHLOW2c − GHLOW2  (BBF0/σ_1
//                         δ-variations subtracted from K_1; full magnitude)
//   - extension piece   = GHLOW2cc − GHLOW2c               (the σ_2 piece
//                          only; the additional, (β,α,γ)-parametric piece
//                          that distinguishes the extended kernel from the
//                          universal one)
// The extension lives entirely on k > 0 — it is non-zero only there because
// the σ_2 δ-variation is one-sided — and starts at the closed-form ATM
// scalar |Δσ_2(0)| = 0.171 bps, decaying to zero as the clip engages.
const kc = computeCurves(byId("knot"), 401, FULL);
const universalSpike = kc.phl1c.map((v, i) => v - kc.phl1[i]);
const extensionSpike = kc.ghlow2cc.map((v, i) => v - kc.ghlow2c[i]);
writeFigure(
	"F4_kernel",
	renderSvg([
		{
			series: [
				{
					label: "R_1 = δ·σ³·K₁^dir",
					x: kc.k,
					y: universalSpike,
					color: "#059669",
					width: 1.8,
				},
				{
					label: "R_2 − R_1",
					x: kc.k,
					y: extensionSpike,
					color: "#9333ea",
					width: 1.8,
					dash: "6 3",
				},
			],
			opts: {
				title: "ATM-knot IV corrections R_n",
				xlabel: "log-moneyness k",
				ylabel: "correction (annualised %)",
				zeroLine: true,
				atmLine: true,
			},
		},
	]),
);
// eslint-disable-next-line no-console
console.log("F4_kernel.svg: K_1 peak =", K1_PEAK.toFixed(6));

// Wait for all PDF stream writes to flush before exiting.
await Promise.all(pendingPdfs);
