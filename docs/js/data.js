/**
 * Loads the pre-built dataset and exposes it as plain typed arrays.
 *
 * Everything here is static: the pipeline has already filled the gaps and
 * resampled each day's curve onto a fixed maturity grid, so the browser only
 * has to slice the array it is handed.
 */

const BASE = "data/";

export async function load() {
  const [manifest, context, buffer] = await Promise.all([
    fetch(BASE + "manifest.json").then(requireOk).then((r) => r.json()),
    fetch(BASE + "context.json").then(requireOk).then((r) => r.json()),
    fetch(BASE + "surface.bin").then(requireOk).then((r) => r.arrayBuffer()),
  ]);

  const cols = manifest.gridCount;
  const raw = new Uint16Array(buffer);
  const rows = raw.length / cols;
  if (rows !== manifest.dayCount) {
    throw new Error(`surface.bin has ${rows} rows, manifest expects ${manifest.dayCount}`);
  }

  // Unpack once into floats. ~440k values, a few milliseconds.
  const yields = new Float32Array(raw.length);
  const { scale, offset } = manifest;
  for (let i = 0; i < raw.length; i++) yields[i] = raw[i] / scale - offset;

  const dates = manifest.dates;
  const dayIndex = new Map(dates.map((d, i) => [d, i]));

  return {
    manifest,
    context,
    yields,
    cols,
    rows,
    dates,
    maturities: manifest.maturities,
    realLow: manifest.realLow,
    realHigh: manifest.realHigh,

    /** Yield at (day, maturity grid column), in percent. */
    at(day, col) {
      return yields[day * cols + col];
    },

    /** Index of a YYYY-MM-DD date, or the nearest trading day at or after it. */
    indexOf(iso) {
      const exact = dayIndex.get(iso);
      if (exact !== undefined) return exact;
      let lo = 0, hi = dates.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid] < iso) lo = mid + 1; else hi = mid;
      }
      return lo;
    },

    /** Highest and lowest yield across a slice of days, for axis scaling. */
    extent(from, to) {
      let lo = Infinity, hi = -Infinity;
      for (let i = from * cols, end = (to + 1) * cols; i < end; i++) {
        const v = yields[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return [lo, hi];
    },
  };
}

function requireOk(response) {
  if (!response.ok) {
    throw new Error(`Could not load ${response.url} (HTTP ${response.status})`);
  }
  return response;
}

/** Format a yield for display. */
export const pct = (v) => `${v.toFixed(2)}%`;

/** "1 Mo", "18 Mo", "10 Yr" — a readable label for a maturity in years. */
export function maturityLabel(years) {
  if (years < 0.95) {
    const months = Math.round(years * 12);
    return `${months} mo`;
  }
  const rounded = years < 2 ? Math.round(years * 10) / 10 : Math.round(years);
  return `${rounded} yr`;
}

/** "Mar 2009" */
export function monthYear(iso) {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}

/** "12 March 2009" */
export function longDate(iso) {
  const MONTHS = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];
  return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}
