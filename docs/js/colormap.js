/**
 * Colour ramps for the surface.
 *
 * Two are needed. Yield levels are always positive, so they get a sequential
 * ramp running cool to warm. The spread modes straddle zero, where a
 * sequential ramp would hide the sign change that is the entire point, so
 * they get a diverging ramp pinned neutral at zero.
 */

// Low rates read as calm, high rates as hot, with lightness rising through the
// middle so neighbouring bands stay apart on a shaded 3D surface.
const SEQUENTIAL = [
  [0.00, 0x0b, 0x1a, 0x4d],
  [0.14, 0x13, 0x4e, 0x9b],
  [0.29, 0x16, 0x88, 0xb2],
  [0.44, 0x36, 0xb1, 0x8b],
  [0.59, 0x9d, 0xc7, 0x5a],
  [0.74, 0xf2, 0xc5, 0x3c],
  [0.88, 0xef, 0x7d, 0x3a],
  [1.00, 0xd8, 0x33, 0x2f],
];

// Blue below zero, warm above, deliberately keeping the same cold-to-hot sense
// as the sequential ramp. The midpoint is a desaturated sand rather than pure
// white so it stays visible against a light background.
const DIVERGING = [
  [0.00, 0x1e, 0x2f, 0x7a],
  [0.16, 0x2f, 0x6d, 0xb5],
  [0.34, 0x94, 0xb8, 0xd8],
  [0.50, 0xe4, 0xdd, 0xcd],
  [0.66, 0xe8, 0xb4, 0x7e],
  [0.84, 0xd9, 0x6e, 0x36],
  [1.00, 0x96, 0x24, 0x1a],
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
const linearise = (stops) =>
  stops.map(([p, r, g, b]) => [p, toLinear(r), toLinear(g), toLinear(b)]);

const RAMPS = {
  sequential: linearise(SEQUENTIAL),
  diverging: linearise(DIVERGING),
};

/** Sample a ramp at t in [0,1]. Writes r,g,b as 0..1 linear floats into `out`. */
export function ramp(t, out, kind = "sequential") {
  const stops = RAMPS[kind] || RAMPS.sequential;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1];
  const f = (t - a[0]) / (b[0] - a[0]);
  out[0] = a[1] + (b[1] - a[1]) * f;
  out[1] = a[2] + (b[2] - a[2]) * f;
  out[2] = a[3] + (b[3] - a[3]) * f;
  return out;
}

/** CSS gradient string for the legend swatch. */
export function cssGradient(kind = "sequential") {
  const stops = kind === "diverging" ? DIVERGING : SEQUENTIAL;
  return `linear-gradient(90deg, ${stops
    .map(([p, r, g, b]) => `rgb(${r},${g},${b}) ${(p * 100).toFixed(0)}%`)
    .join(",")})`;
}

/** Colours for the balance-sheet programmes marked on the floor. */
export const REGIME_COLOURS = {
  ease:    0x3aa8e0,
  twist:   0x8f7fe0,
  taper:   0xe0a13a,
  tighten: 0xe05a5a,
};
