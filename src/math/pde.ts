/**
 * Dupire forward PDE (ground truth) + Black implied-vol inversion.
 *
 * PDE in log-moneyness k = ln(K/F), F=1, r=0:
 *   dC/dT = 0.5 sigma_loc(k)^2 (d2C/dk2 - dC/dk)
 *
 * Rannacher startup (2 backward-Euler steps) then Crank-Nicolson, Dirichlet
 * BCs (intrinsic left, 0 right), domain widened so boundary mass is
 * negligible. Port of pricers.solve_dupire_pde_on_grid /
 * implied_vol_from_prices. Black is the codebase T=1, F=1, total-vol
 * convention so the inverted vol is already a total vol.
 */
import { normCdf } from './normal';

const RANNACHER_BE_STEPS = 2;

/** Solve a tridiagonal system (Thomas algorithm). a:sub, b:diag, c:super, d:rhs. */
function thomas(a: number[], b: number[], c: number[], d: number[]): number[] {
  const n = b.length;
  const cp = new Array<number>(n);
  const dp = new Array<number>(n);
  cp[0] = c[0] / b[0];
  dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = c[i] / m;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  const x = new Array<number>(n);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

/**
 * Solve the Dupire PDE on a caller grid.
 * @param kGrid       log-moneyness grid (must straddle 0)
 * @param sigmaLocPct sigma_loc sampled at kGrid in annualised %
 * @param nT          time steps
 * @param scale       annualised % -> total vol divisor
 * @returns undiscounted call prices on kGrid
 */
export function solveDupirePde(
  kGrid: number[],
  sigmaLocPct: number[],
  nT: number,
  scale: number,
): number[] {
  const nk = kGrid.length;
  const dk = kGrid[1] - kGrid[0];
  const dt = 1 / nT;
  const halfVar = sigmaLocPct.map((s) => 0.5 * (s / scale) ** 2);
  const call = kGrid.map((k) => Math.max(1 - Math.exp(k), 0));
  const nInt = nk - 2;

  // Per-interior-point CN coefficients.
  const alphaCN = new Array<number>(nInt);
  const betaCN = new Array<number>(nInt);
  for (let i = 0; i < nInt; i++) {
    alphaCN[i] = (dt * halfVar[i + 1]) / (2 * dk * dk);
    betaCN[i] = (dt * halfVar[i + 1]) / (4 * dk);
  }
  const leftBc = 1 - Math.exp(kGrid[0]);

  // Implicit-side tridiagonal bands for CN and BE.
  const subCN = new Array<number>(nInt);
  const diagCN = new Array<number>(nInt);
  const supCN = new Array<number>(nInt);
  const subBE = new Array<number>(nInt);
  const diagBE = new Array<number>(nInt);
  const supBE = new Array<number>(nInt);
  for (let i = 0; i < nInt; i++) {
    subCN[i] = -(alphaCN[i] + betaCN[i]);
    diagCN[i] = 1 + 2 * alphaCN[i];
    supCN[i] = -(alphaCN[i] - betaCN[i]);
    const aBE = 2 * alphaCN[i];
    const bBE = 2 * betaCN[i];
    subBE[i] = -(aBE + bBE);
    diagBE[i] = 1 + 2 * aBE;
    supBE[i] = -(aBE - bBE);
  }

  for (let step = 0; step < nT; step++) {
    const rhs = new Array<number>(nInt);
    if (step < RANNACHER_BE_STEPS) {
      for (let i = 0; i < nInt; i++) rhs[i] = call[i + 1];
      rhs[0] -= subBE[0] * leftBc;
      const sol = thomas(subBE, diagBE, supBE, rhs);
      for (let i = 0; i < nInt; i++) call[i + 1] = sol[i];
    } else {
      for (let i = 0; i < nInt; i++) {
        const lo = alphaCN[i] + betaCN[i];
        const di = 1 - 2 * alphaCN[i];
        const up = alphaCN[i] - betaCN[i];
        rhs[i] = lo * call[i] + di * call[i + 1] + up * call[i + 2];
      }
      rhs[0] -= subCN[0] * leftBc;
      const sol = thomas(subCN, diagCN, supCN, rhs);
      for (let i = 0; i < nInt; i++) call[i + 1] = sol[i];
    }
    call[0] = leftBc;
    call[nk - 1] = 0;
  }
  return call;
}

/** Black T=1, F=1 price. q=+1 call, q=-1 put. sigma is total vol. */
function blackPrice(strike: number, sigma: number, q: number): number {
  if (sigma <= 0) return Math.max(q * (1 - strike), 0);
  const k = Math.log(strike);
  const d1 = (-k + 0.5 * sigma * sigma) / sigma;
  const d2 = d1 - sigma;
  return q * (normCdf(q * d1) - strike * normCdf(q * d2));
}

/**
 * Invert Black price -> total vol by bisection. Returns NaN when the (OTM)
 * option's time value has underflowed to ~intrinsic: at the deep wings the
 * Dupire price carries no recoverable vol information, so IV is genuinely
 * undefined there. NaN (rather than a spurious 0) makes the charts end in
 * the region where the approximation is valid — the deep-wing breakdown the
 * note discusses, shown honestly instead of as a fake spike.
 */
function impliedVol(price: number, strike: number, q: number): number {
  const intrinsic = Math.max(q * (1 - strike), 0);
  if (price <= intrinsic + 1e-12) return NaN;
  let lo = 1e-6;
  let hi = 8;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (blackPrice(strike, mid, q) > price) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-12) break;
  }
  return 0.5 * (lo + hi);
}

/** Total IV from undiscounted call prices (F=1); puts via parity for k<0. */
export function impliedVolFromPrices(kGrid: number[], callPrices: number[]): number[] {
  return kGrid.map((k, i) => {
    const strike = Math.exp(k);
    if (k >= 0) return impliedVol(callPrices[i], strike, 1);
    return impliedVol(callPrices[i] - (1 - strike), strike, -1);
  });
}
