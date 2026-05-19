/**
 * Regenerate the committed figures from the TS math core. Deterministic SVG
 * (full-resolution PDE) — `npm run figures` then `git diff` lets a cloner
 * confirm the images are identical. Run: `npx tsx src/figures/generate.ts`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeCurves, type ModelInputs } from '../math/model';
import { PHI_BB_PEAK } from '../math/phibb';
import { renderSvg, type Series } from './svg';
import examples from '../../examples/params.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'figures');
mkdirSync(OUT, { recursive: true });

const EX = (examples as { examples: ModelInputs[] & { id: string; label: string }[] }).examples;
const byId = (id: string) => EX.find((e) => (e as unknown as { id: string }).id === id)!;

const FULL = { nGrid: 3201, nSteps: 3200 };

function smileFig(file: string, title: string, inp: ModelInputs, knot: boolean): void {
  const c = computeCurves(inp, 401, FULL);
  const fourth: Series = knot
    ? { label: 'PHL1 + Φ_BB corr', x: c.k, y: c.phl1Corrected, color: '#dc2626', width: 1.8 }
    : { label: 'GHLOW2', x: c.k, y: c.ghlow2, color: '#ea580c' };
  const iv: Series[] = [
    { label: 'PDE (truth)', x: c.k, y: c.pde, color: '#18181b', width: 2 },
    { label: 'BBF0', x: c.k, y: c.bbf0, color: '#a1a1aa', dash: '5 4' },
    { label: 'PHL1', x: c.k, y: c.phl1, color: '#2563eb' },
    fourth,
  ];
  const e = (y: number[]) => y.map((v, i) => (v - c.pde[i]) * 100);
  const err: Series[] = [
    { label: 'BBF0 − PDE', x: c.k, y: e(c.bbf0), color: '#a1a1aa', dash: '5 4' },
    { label: 'PHL1 − PDE', x: c.k, y: e(c.phl1), color: '#2563eb' },
    knot
      ? { label: 'PHL1+corr − PDE', x: c.k, y: e(c.phl1Corrected), color: '#dc2626', width: 1.8 }
      : { label: 'GHLOW2 − PDE', x: c.k, y: e(c.ghlow2), color: '#ea580c' },
  ];
  const panels = [
    { series: iv, opts: { title, xlabel: 'log-moneyness k', ylabel: 'implied vol (ann %)', atmLine: knot } },
    {
      series: err,
      opts: {
        title: 'Error vs PDE (basis points)',
        xlabel: 'log-moneyness k',
        ylabel: 'error (bps)',
        zeroLine: true,
        atmLine: knot,
      },
    },
  ];
  // BBF0's error dwarfs the others and squashes the y-axis; a third panel
  // without BBF0 makes the PHL1 / GHLOW2 (resp. PHL1+corr) comparison legible.
  if (!knot) {
    panels.push({
      series: err.filter((s) => !s.label.startsWith('BBF0')),
      opts: {
        title: 'Error vs PDE — BBF0 excluded (PHL1 vs GHLOW2)',
        xlabel: 'log-moneyness k',
        ylabel: 'error (bps)',
        zeroLine: true,
        atmLine: knot,
      },
    });
  }
  const svg = renderSvg(panels);
  writeFileSync(join(OUT, file), svg);
  const maxBbf =
    Math.max(
      ...c.bbf0.map((v, i) => Math.abs(v - c.pde[i])).filter((d) => isFinite(d)),
    ) * 100;
  // eslint-disable-next-line no-console
  console.log(`${file}: max|BBF0−PDE| = ${maxBbf.toFixed(1)} bps`);
}

// F1 happy, F2 concave (no knot): PDE/BBF0/PHL1/GHLOW2.
smileFig('F1_happy.svg', 'Happy case — SPXW 2025-03-10 DTE 1 (monotone skew)', byId('happy'), false);
smileFig('F2_concave.svg', 'Concave case — SPXW 2025-03-10 DTE 3 (concave smile)', byId('concave'), false);
// F3 unhappy fake knot at k=0: PDE/BBF0/PHL1/PHL1+correction.
smileFig('F3_knot.svg', 'Unhappy case — fake ATM knot at k=0', byId('knot'), true);

// F4: the applied ATM-knot correction in annualised % for the knot example
// (= PHL1+corr − PHL1 = δ·σ_total³·Φ_BB^directed(k/σ_total, 0)), consistent
// with the interactive page's 4th panel. The dimensionless kernel shape and
// its peak constant 3√(2π)/128 are still annotated in the title.
const kc = computeCurves(byId('knot'), 401, FULL);
const corr = kc.phl1Corrected.map((v, i) => v - kc.phl1[i]);
writeFileSync(
  join(OUT, 'F4_kernel.svg'),
  renderSvg([
    {
      series: [
        { label: 'δ·σ_total³·Φ_BB^dir', x: kc.k, y: corr, color: '#059669', width: 1.8 },
      ],
      opts: {
        title: `ATM-knot IV correction added to PHL1 (kernel peak Φ_BB(0,0) = ${PHI_BB_PEAK.toFixed(5)})`,
        xlabel: 'log-moneyness k',
        ylabel: 'correction (annualised %)',
        zeroLine: true,
        atmLine: true,
      },
    },
  ]),
);
// eslint-disable-next-line no-console
console.log('F4_kernel.svg: Phi_BB peak =', PHI_BB_PEAK.toFixed(6));
