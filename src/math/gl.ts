/**
 * Gauss-Legendre nodes/weights, computed at runtime by Newton-Raphson on the
 * Legendre polynomial P_n (Newton-Cotes-free). ~1e-15 accuracy on nodes and
 * weights (BBF0/u1u0 use 16 pt; the K_1 bridge integral 32 pt).
 */

export interface GaussLegendre {
  nodes: number[]; // on [-1, 1]
  weights: number[];
}

const cache = new Map<number, GaussLegendre>();

/** n-point Gauss-Legendre rule on [-1, 1]. */
export function gaussLegendre(n: number): GaussLegendre {
  const hit = cache.get(n);
  if (hit) return hit;
  const nodes = new Array<number>(n);
  const weights = new Array<number>(n);
  const m = (n + 1) >> 1;
  for (let i = 0; i < m; i++) {
    // Initial guess (Francesco Tricomi asymptotic), then Newton refine.
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let iter = 0; iter < 100; iter++) {
      // Legendre P_n(x) and derivative via recurrence.
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    const w = 2 / ((1 - x * x) * dp * dp);
    nodes[i] = -x;
    nodes[n - 1 - i] = x;
    weights[i] = w;
    weights[n - 1 - i] = w;
  }
  const res = { nodes, weights };
  cache.set(n, res);
  return res;
}

/** Integrate `f` on [a, b] with an n-point Gauss-Legendre rule. */
export function glIntegrate(f: (y: number) => number, a: number, b: number, n: number): number {
  const { nodes, weights } = gaussLegendre(n);
  const half = 0.5 * (b - a);
  const mid = 0.5 * (a + b);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += weights[i] * f(mid + half * nodes[i]);
  return acc * half;
}
