/**
 * Orchestration: given user inputs build the implied-vol curves the page /
 * graphs need. Units: sigma,beta,alpha,gamma,delta are coefficients in
 * annualised %, k = log(K/F). All output curves are annualised %.
 *
 * The ATM knot adds delta*k^3*H(k). Because the perturbation and its first
 * two derivatives vanish at k=0, the surface for k>0 is just the base cubic
 * with gamma -> gamma+delta (C^2-joined at 0). Each closed-form method's
 * integration domain [0,k] stays on one side of the knot, so per-k we feed
 * the effective single cubic — exactly the piecewise behaviour of the
 * production calibrator with a knot pinned at ATM.
 */
import type { CubicCoeffs } from './cubic';
import { sigmaLoc } from './cubic';
import { bbf0 } from './bbf0';
import { phl1 } from './phl1';
import { ghlow2 } from './ghlow2';
import { knotSpike } from './phibb';
import { solveDupirePde, impliedVolFromPrices } from './pde';

export interface ModelInputs {
  sigma: number;
  beta: number;
  alpha: number;
  gamma: number;
  delta: number; // gamma discontinuity at the ATM knot (0 = no knot)
  dte: number; // business days to expiry; n_bdays = max(1, dte)
}

export interface ModelCurves {
  k: number[];
  sigmaLoc: number[];
  bbf0: number[];
  phl1: number[];
  ghlow2: number[];
  phl1Corrected: number[]; // PHL1 + ATM-knot Phi_BB correction
  pde: number[];
  hasKnot: boolean;
  scale: number;
  sigmaTotal: number;
}

export function volScale(nBdays: number): number {
  return (Math.sqrt(252) / Math.sqrt(Math.max(nBdays, 1))) * 100;
}

function effectiveCubic(k: number, c: CubicCoeffs, delta: number): CubicCoeffs {
  return k > 0 && delta !== 0 ? { ...c, gamma: c.gamma + delta } : c;
}

function perturbedSigmaLoc(k: number, c: CubicCoeffs, delta: number): number {
  return sigmaLoc(k, c) + (k > 0 ? delta * k * k * k : 0);
}

export interface PdeRes {
  nGrid: number;
  nSteps: number;
}

/** Build all curves on a strike band of +/- a few sigma_total around ATM. */
export function computeCurves(
  inp: ModelInputs,
  nPoints = 401,
  pdeRes: PdeRes = { nGrid: 3201, nSteps: 3200 },
): ModelCurves {
  const c: CubicCoeffs = { sigma: inp.sigma, beta: inp.beta, alpha: inp.alpha, gamma: inp.gamma };
  const nBdays = Math.max(1, Math.round(inp.dte));
  const scale = volScale(nBdays);
  const sigmaTotal = inp.sigma / scale;
  const hasKnot = inp.delta !== 0;

  const kLo = -3.5 * sigmaTotal;
  const kHi = 3.0 * sigmaTotal;
  const k: number[] = [];
  for (let i = 0; i < nPoints; i++) k.push(kLo + ((kHi - kLo) * i) / (nPoints - 1));

  const sLoc = k.map((kk) => perturbedSigmaLoc(kk, c, inp.delta));
  const bbf0C = k.map((kk) => bbf0(kk, effectiveCubic(kk, c, inp.delta)));
  const phl1C = k.map((kk) => phl1(kk, effectiveCubic(kk, c, inp.delta), scale));
  const ghl2C = hasKnot
    ? k.map(() => NaN)
    : k.map((kk) => ghlow2(kk, c, scale));
  const corrC = phl1C.map((p, i) => (hasKnot ? p + knotSpike(k[i], inp.delta, sigmaTotal) : p));

  // PDE on a widened grid so Dirichlet boundary mass is negligible.
  const gLo = 2 * kLo;
  const gHi = 2 * kHi;
  const nG = pdeRes.nGrid;
  const kGrid: number[] = [];
  for (let i = 0; i < nG; i++) kGrid.push(gLo + ((gHi - gLo) * i) / (nG - 1));
  const sigPct = kGrid.map((kk) => perturbedSigmaLoc(kk, c, inp.delta));
  const callPrices = solveDupirePde(kGrid, sigPct, pdeRes.nSteps, scale);
  const ivPde = impliedVolFromPrices(kGrid, callPrices).map((v) => v * scale);
  const pde = k.map((kk) => interp(kk, kGrid, ivPde, kLo, kHi));

  return {
    k,
    sigmaLoc: sLoc,
    bbf0: bbf0C,
    phl1: phl1C,
    ghlow2: ghl2C,
    phl1Corrected: corrC,
    pde,
    hasKnot,
    scale,
    sigmaTotal,
  };
}

/** Linear interpolation of (xs, ys) at x, restricted to [lo, hi]. */
function interp(x: number, xs: number[], ys: number[], lo: number, hi: number): number {
  const xc = Math.min(Math.max(x, lo), hi);
  let i = 1;
  while (i < xs.length - 1 && xs[i] < xc) i++;
  const x0 = xs[i - 1];
  const x1 = xs[i];
  const t = (xc - x0) / (x1 - x0);
  return ys[i - 1] + t * (ys[i] - ys[i - 1]);
}
