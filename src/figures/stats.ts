/**
 * Per-method error stats for every committed example. Feeds the concrete
 * numbers cited in the paper captions, the README blurbs, and any prose
 * that compares method accuracy. Run: `npx tsx src/figures/stats.ts`.
 * Output is plain text so a diff after a math change is easy to read.
 */
import { computeCurves, type ModelInputs } from '../math/model';
import examples from '../../examples/params.json';

const EX = (examples as { examples: (ModelInputs & { id: string; label: string })[] }).examples;
const FULL = { nGrid: 3201, nSteps: 3200 };

const METHODS: { key: keyof ReturnType<typeof computeCurves>; label: string }[] = [
  { key: 'bbf0', label: 'BBF0' },
  { key: 'phl1', label: 'PHL1' },
  { key: 'phl1c', label: 'PHL1c' },
  { key: 'ghlow2', label: 'GHLOW2' },
  { key: 'ghlow2c', label: 'GHLOW2c' },
  { key: 'ghlow2cc', label: 'GHLOW2cc' },
];

function statsFor(ex: ModelInputs & { id: string; label: string }): void {
  const c = computeCurves(ex, 401, FULL);
  // ATM index (closest k to zero) and its left/right neighbours for the
  // value-jump diagnostic at the knot.
  let i0 = 0;
  for (let i = 1; i < c.k.length; i++) {
    if (Math.abs(c.k[i]) < Math.abs(c.k[i0])) i0 = i;
  }
  const iL = Math.max(0, i0 - 1);
  const iR = Math.min(c.k.length - 1, i0 + 1);

  // eslint-disable-next-line no-console
  console.log(`\n=== ${ex.id} (${ex.label}) ===`);
  for (const m of METHODS) {
    const y = c[m.key] as number[];
    const errs = y.map((v, i) => (v - c.pde[i]) * 100);
    const finite = errs.filter((d) => isFinite(d));
    const max = Math.max(...finite.map(Math.abs));
    const errAtm = (y[i0] - c.pde[i0]) * 100;
    const errL = (y[iL] - c.pde[iL]) * 100;
    const errR = (y[iR] - c.pde[iR]) * 100;
    const jump = errR - errL; // at the knot: jump between just-left and just-right error
    // eslint-disable-next-line no-console
    console.log(
      `  ${m.label.padEnd(9)} max|err|=${max.toFixed(3).padStart(7)} bps  ` +
        `ATM=${errAtm.toFixed(3).padStart(7)}  L=${errL.toFixed(3).padStart(7)}  R=${errR.toFixed(3).padStart(7)}  (R−L)=${jump.toFixed(3)} bps`,
    );
  }
}

for (const ex of EX) statsFor(ex);
