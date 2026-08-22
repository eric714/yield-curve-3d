/**
 * Sequential colour ramp for yield levels.
 *
 * Runs cool-to-warm so that low rates read as calm and high rates read as hot,
 * with lightness rising monotonically through the middle so neighbouring bands
 * stay distinguishable on a shaded 3D surface.
 */
const STOPS = [
  [0.00, 0x0b, 0x1a, 0x4d],
  [0.14, 0x13, 0x4e, 0x9b],
  [0.29, 0x16, 0x88, 0xb2],
  [0.44, 0x36, 0xb1, 0x8b],
  [0.59, 0x9d, 0xc7, 0x5a],
  [0.74, 0xf2, 0xc5, 0x3c],
  [0.88, 0xef, 0x7d, 0x3a],
  [1.00, 0xd8, 0x33, 0x2f],
];

/**
 * three.js works in linear colour space and converts to sRGB on output, so
 * feeding sRGB values straight into a vertex-colour attribute washes the
 * midtones out. Convert the stops once, up front.
 */
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const LINEAR = STOPS.map(([p, r, g, b]) => [p, toLinear(r), toLinear(g), toLinear(b)]);

/** Sample the ramp at t in [0,1]. Writes r,g,b as 0..1 floats into `out`. */
export function ramp(t, out) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  let i = 0;
  while (i < LINEAR.length - 2 && t > LINEAR[i + 1][0]) i++;
  const a = LINEAR[i], b = LINEAR[i + 1];
  const f = (t - a[0]) / (b[0] - a[0]);
  out[0] = a[1] + (b[1] - a[1]) * f;
  out[1] = a[2] + (b[2] - a[2]) * f;
  out[2] = a[3] + (b[3] - a[3]) * f;
  return out;
}

/** CSS gradient string, for the legend swatch. */
export function cssGradient() {
  const parts = STOPS.map(
    ([p, r, g, b]) => `rgb(${r},${g},${b}) ${(p * 100).toFixed(0)}%`
  );
  return `linear-gradient(90deg, ${parts.join(",")})`;
}

/** Colours for the balance-sheet programmes marked on the floor. */
export const REGIME_COLOURS = {
  ease:    0x3aa8e0,
  twist:   0x8f7fe0,
  taper:   0xe0a13a,
  tighten: 0xe05a5a,
};
