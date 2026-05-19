/**
 * Cross-check the TS port against numbers produced by the trusted,
 * independently-developed Python reference implementation.
 * tests/reference.json is committed so this runs in CI with no Python.
 */
import { describe, it, expect } from 'vitest';
import ref from './reference.json';
import type { CubicCoeffs } from '../src/math/cubic';
import { bbf0 } from '../src/math/bbf0';
import { phl1 } from '../src/math/phl1';
import { ghlow2 } from '../src/math/ghlow2';
import { sigmaLoc } from '../src/math/cubic';
import { phiBB, phiBBDirected, PHI_BB_PEAK, knotSpike } from '../src/math/phibb';
import { computeCurves } from '../src/math/model';

const HAPPY: CubicCoeffs = {
  sigma: 31.12869431205608,
  beta: -104.84746098573555,
  alpha: 3076.241202978902,
  gamma: -45158.46287590234,
};
const CONCAVE: CubicCoeffs = {
  sigma: 28.303289918533753,
  beta: -91.01397782800612,
  alpha: -2448.8648048728382,
  gamma: 2808.9138721582217,
};

function close(a: number, b: number, rtol = 1e-7, atol = 1e-8): void {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(atol + rtol * Math.abs(b));
}

describe('closed-form methods vs Python reference', () => {
  for (const [tag, c] of [
    ['dte1', HAPPY],
    ['dte3', CONCAVE],
  ] as const) {
    const r = (ref as any)[tag];
    const scale: number = r.scale;
    it(`${tag} sigma_loc / BBF0 / PHL1 / GHLOW2`, () => {
      r.k.forEach((k: number, i: number) => {
        close(sigmaLoc(k, c), r.sigma_loc[i]);
        close(bbf0(k, c), r.bbf0[i], 1e-6);
        close(phl1(k, c, scale), r.phl1[i], 1e-6);
        close(ghlow2(k, c, scale), r.ghlow2[i], 1e-5);
      });
    });
  }
});

describe('Phi_BB kernel vs Python reference', () => {
  const r = (ref as any).phibb_w0;
  it('peak constant', () => close(PHI_BB_PEAK, 0.058749096544888385, 1e-12));
  it('phi_bb and phi_bb_directed at w=0', () => {
    r.x.forEach((x: number, i: number) => {
      close(phiBB(x, 0), r.phi_bb[i], 1e-9);
      close(phiBBDirected(x, 0), r.phi_bb_directed[i], 1e-9);
    });
  });
});

describe('knot case (spike + PHL1 + PDE) vs Python reference', () => {
  const r = (ref as any).knot;
  const delta: number = r.delta;
  const sigmaTotal: number = r.sigma_total;
  it('Phi_BB spike matches phl1s_spike', () => {
    r.k.forEach((k: number, i: number) => {
      close(knotSpike(k, delta, sigmaTotal), r.spike[i], 1e-7, 1e-7);
    });
  });
  it('full model curves track the reference (PHL1, PHL1+corr, PDE)', () => {
    const curves = computeCurves({ ...HAPPY, delta, dte: 1 }, 401);
    // The fixture sampled k_eval[::40]; reproduce that subsample.
    r.k.forEach((kRef: number, idx: number) => {
      // find nearest model k
      let j = 0;
      let best = Infinity;
      curves.k.forEach((kk, jj) => {
        const d = Math.abs(kk - kRef);
        if (d < best) {
          best = d;
          j = jj;
        }
      });
      close(curves.phl1[j], r.phl1[idx], 5e-4, 5e-3);
      close(curves.phl1Corrected[j], r.phl1_plus_corr[idx], 5e-4, 5e-3);
      close(curves.pde[j], r.pde[idx], 2e-3, 0.05);
    });
  });
});
