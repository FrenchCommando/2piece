/**
 * Right-side wing scan for the two ATM-knot corrections. The universal
 * K_1^dir kernel is bounded by construction at w=0 (the x³/4 + x/4
 * polynomial collapse). The σ_2-subtraction piece in the extended GHLOW2
 * kernel is NOT bounded by the same argument — σ_2 itself grows like k^3
 * on the wings via its ξ³/(8 d⁵) term, and the w=0 collapse only addresses
 * the K_1 bridge integral. We therefore clip |σ_2-piece| at the
 * closed-form ATM scalar |Δσ_2(0)| inside knotSpikeGhlow2cc (eq.
 * ghlow2-gap); this scan is the regression check for that clip and a
 * sanity tool when the cubic is dialled.
 *
 * Run: `npx tsx src/figures/asymptotic_scan.ts`.
 */
import { computeCurves, type ModelInputs } from '../math/model';
import examples from '../../examples/params.json';
import { knotSpikePhl1, knotSpikeGhlow2cc } from '../math/kernel';
import { sigmaLoc, type CubicCoeffs } from '../math/cubic';

const EX = (examples as { examples: (ModelInputs & { id: string })[] }).examples;
const knot = EX.find((e) => (e as unknown as { id: string }).id === 'knot')!;

// Need scale + sigmaTotal — get them from a quick computeCurves run.
const c = computeCurves(knot, 11);
const sigmaTotal = c.sigmaTotal;
const scale = c.scale;
const cubic: CubicCoeffs = {
  sigma: knot.sigma,
  beta: knot.beta,
  alpha: knot.alpha,
  gamma: knot.gamma,
};

const cap =
  Math.abs((cubic.sigma ** 3 * cubic.beta * knot.delta) / (20 * scale ** 4));
console.log(`sigmaTotal=${sigmaTotal.toFixed(6)}  scale=${scale.toFixed(3)}`);
console.log(`delta=${knot.delta}`);
console.log(`σ_2 clip = |Δσ_2(0)| = ${cap.toExponential(3)} ann% (= ${(cap * 100).toFixed(3)} bps)`);
console.log();
console.log(`x (=k/σ_total)   k            σ_loc(k+, perturbed)   universal-spike(ann%)   extended-spike(ann%)`);

// Right side only — scan x from 0.5 to a very wide band, well past where the
// cubic still makes physical sense, to expose any asymptotic divergence.
const xs = [0.5, 1, 2, 3, 5, 8, 12, 20, 30, 50];
for (const x of xs) {
  const k = x * sigmaTotal;
  // perturbed cubic (k > 0 side): gamma -> gamma + delta
  const cPert: CubicCoeffs = { ...cubic, gamma: cubic.gamma + knot.delta };
  const sLocPert = sigmaLoc(k, cPert) + 0; // already incorporates delta on k>0 side
  const u = knotSpikePhl1(k, knot.delta, sigmaTotal);
  const e = knotSpikeGhlow2cc(k, cubic, knot.delta, sigmaTotal, scale);
  console.log(
    `${x.toFixed(2).padStart(6)}        ${k.toFixed(4).padStart(8)}   ${sLocPert.toFixed(2).padStart(12)}            ${u.toExponential(3).padStart(12)}            ${e.toExponential(3).padStart(12)}`,
  );
}
