/**
 * Cross-check the TS math core against the frozen reference fixture
 * (tests/reference.json). The fixture is committed; CI runs this on every
 * push to guard against silent drift in BBF0/PHL1/GHLOW2/K_1 or the
 * knot-case model.
 */
import { describe, it, expect } from 'vitest';
import ref from './reference.json';
import type { CubicCoeffs } from '../src/math/cubic';
import { bbf0 } from '../src/math/bbf0';
import { phl1 } from '../src/math/phl1';
import { ghlow2 } from '../src/math/ghlow2';
import { sigmaLoc } from '../src/math/cubic';
import { K1, K1Dir, K1_PEAK, knotSpikePhl1 } from '../src/math/kernel';
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

describe('closed-form methods vs reference fixture', () => {
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

describe('K_1 kernel vs reference fixture', () => {
  const r = (ref as any).K1_w0;
  it('peak constant', () => close(K1_PEAK, 0.058749096544888385, 1e-12));
  it('K_1 and K_1^dir at w=0', () => {
    r.x.forEach((x: number, i: number) => {
      close(K1(x, 0), r.K1[i], 1e-9);
      close(K1Dir(x, 0), r.K1_dir[i], 1e-9);
    });
  });
});

describe('knot case (spike + PHL1 + PDE) vs reference fixture', () => {
  const r = (ref as any).knot;
  const delta: number = r.delta;
  const sigmaTotal: number = r.sigma_total;
  it('K_1 spike matches phl1s_spike', () => {
    r.k.forEach((k: number, i: number) => {
      close(knotSpikePhl1(k, delta, sigmaTotal), r.spike[i], 1e-7, 1e-7);
    });
  });
  it('full model curves track the reference (PHL1, PHL1c, PDE)', () => {
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
      close(curves.phl1c[j], r.phl1_plus_corr[idx], 5e-4, 5e-3);
      close(curves.pde[j], r.pde[idx], 2e-3, 0.05);
    });
  });
});
