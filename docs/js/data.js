/**
 * Loads the pre-built dataset and exposes it as plain typed arrays.
 *
 * Everything here is static: the pipeline has already filled the gaps and
 * resampled each day's curve onto a fixed maturity grid, so the browser only
 * has to slice the array it is handed.
 */

const BASE = "data/";

export async function load() {
  const [manifest, context, buffer, tenorBuffer] = await Promise.all([
    fetch(BASE + "manifest.json").then(requireOk).then((r) => r.json()),
    fetch(BASE + "context.json").then(requireOk).then((r) => r.json()),
    fetch(BASE + "surface.bin").then(requireOk).then((r) => r.arrayBuffer()),
    fetch(BASE + "tenors.bin").then(requireOk).then((r) => r.arrayBuffer()),
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

  // Published tenors, stored separately from the resampled surface so the
  // readout can quote the numbers Treasury actually released. Each row is the
  // 14 tenor values followed by a bitmask of which ones were published rather
  // than filled in.
  const tenorCount = manifest.tenorYears.length;
  const tenorStride = tenorCount + 1;
  const tenorRaw = new Uint16Array(tenorBuffer);
  const tenors = new Float32Array(rows * tenorCount);
  const published = new Uint16Array(rows);
  for (let r = 0; r < rows; r++) {
    const src = r * tenorStride;
    for (let t = 0; t < tenorCount; t++) {
      tenors[r * tenorCount + t] = tenorRaw[src + t] / scale - offset;
    }
    published[r] = tenorRaw[src + tenorCount];
  }

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

    tenorCount,
    tenorYears: manifest.tenorYears,
    tenorLabels: manifest.tenorLabels,

    /** Yield at (day, maturity grid column), in percent. */
    at(day, col) {
      return yields[day * cols + col];
    },

    /** Raw tenor values for one day, as a view into the backing array. */
    tenorRow(day) {
      return tenors.subarray(day * tenorCount, (day + 1) * tenorCount);
    },

    /** Bitmask of which tenors were published rather than filled in. */
    publishedMask(day) {
      return published[day];
    },

    /** The published tenor curve for one day: [{label, years, value, real}]. */
    tenorCurve(day) {
      const base = day * tenorCount;
      const mask = published[day];
      const out = [];
      for (let t = 0; t < tenorCount; t++) {
        out.push({
          label: manifest.tenorLabels[t],
          years: manifest.tenorYears[t],
          value: tenors[base + t],
          real: ((mask >> t) & 1) === 1,
        });
      }
      return out;
    },

    /** One published tenor, by maturity in years. */
    tenorAt(day, years) {
      const t = manifest.tenorYears.indexOf(years);
      return t < 0 ? null : tenors[day * tenorCount + t];
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
    // Treasury publishes a 1.5-month tenor, so months are not always whole.
    const months = years * 12;
    const whole = Math.abs(months - Math.round(months)) < 0.05;
    return `${whole ? Math.round(months) : Math.round(months * 10) / 10} mo`;
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
