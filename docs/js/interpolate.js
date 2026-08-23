/**
 * Monotone cubic interpolation across a yield curve.
 *
 * The same method the data pipeline uses, ported so the browser can rebuild
 * the surface when the reader chooses a different set of maturities. An
 * ordinary cubic spline overshoots between knots and invents humps that were
 * never in the curve; this variant cannot.
 */

/**
 * Fill `out` with values interpolated through the knots (xs, ys).
 *
 * `xs` must be ascending. `targets` may extend past either end, in which case
 * the end slope is continued rather than the polynomial, which keeps the
 * extension from curling away.
 */
export function pchip(xs, ys, n, targets, out) {
  if (n === 0) return out;
  if (n === 1) {
    out.fill(ys[0], 0, targets.length);
    return out;
  }

  const h = SCRATCH_H.length >= n ? SCRATCH_H : (SCRATCH_H = new Float64Array(n * 2));
  const delta = SCRATCH_D.length >= n ? SCRATCH_D : (SCRATCH_D = new Float64Array(n * 2));
  const d = SCRATCH_S.length >= n ? SCRATCH_S : (SCRATCH_S = new Float64Array(n * 2));

  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    delta[i] = (ys[i + 1] - ys[i]) / h[i];
  }

  d[0] = delta[0];
  d[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      d[i] = 0;                       // local extremum: flatten to stop overshoot
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }

  for (let t = 0; t < targets.length; t++) {
    const x = targets[t];
    if (x <= xs[0]) { out[t] = ys[0] + d[0] * (x - xs[0]); continue; }
    if (x >= xs[n - 1]) { out[t] = ys[n - 1] + d[n - 1] * (x - xs[n - 1]); continue; }

    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    const s = (x - xs[lo]) / h[lo];
    const s2 = s * s, s3 = s2 * s;
    out[t] = ys[lo] * (2 * s3 - 3 * s2 + 1)
           + h[lo] * d[lo] * (s3 - 2 * s2 + s)
           + ys[lo + 1] * (-2 * s3 + 3 * s2)
           + h[lo] * d[lo + 1] * (s3 - s2);
  }
  return out;
}

let SCRATCH_H = new Float64Array(32);
let SCRATCH_D = new Float64Array(32);
let SCRATCH_S = new Float64Array(32);
