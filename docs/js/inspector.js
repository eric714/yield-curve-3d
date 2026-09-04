/**
 * The readout panel.
 *
 * The cursor picks a date, never a single point on the surface, so the panel
 * can show the whole curve for that day at once: every tenor Treasury
 * publishes, the policy rate, the classic spreads, and whatever series is
 * currently drawn on the back wall.
 */
import { longDate, maturityLabel } from "./data.js";
import { HEIGHT_MODES } from "./layers.js";

export class Inspector {
  constructor(el, data) {
    this.el = el;
    this.data = data;
    this.pinned = null;
  }

  clear() {
    if (this.pinned != null) return;
    this.el.hidden = true;
  }

  /** Render the panel for one day. `summary` comes back from Layers.update. */
  show(day, state, summary) {
    if (day == null) return this.clear();
    const data = this.data;
    const iso = data.dates[day];
    const curve = data.tenorCurve(day);
    const mode = HEIGHT_MODES[state.heightMode] || HEIGHT_MODES.level;

    const ffHi = data.context.fedFundsUpper[day];
    const ffLo = data.context.fedFundsLower[day];
    const funds = ffHi == null ? null
      : Math.abs(ffHi - ffLo) < 1e-9 ? pct(ffHi) : `${pct(ffLo)}–${pct(ffHi)}`;

    const at = (years) => curve.find((c) => c.years === years)?.value;
    const spread = (a, b) => {
      const x = at(a), y = at(b);
      return x == null || y == null ? "—" : signed(x - y);
    };

    const anyFilled = curve.some((c) => !c.real);

    const rows = curve.map((c) => `
      <div class="ins-cell${c.real ? "" : " filled"}">
        <span class="ins-m">${maturityLabel(c.years)}</span>
        <span class="ins-v">${c.value.toFixed(2)}</span>
      </div>`).join("");

    const extras = [];
    if (this.historyTenor) {
      extras.push(["History line", this.historyTenor.label]);
    }
    if (funds) extras.push(["Fed funds target", funds]);
    extras.push(["10yr − 2yr", spread(10, 2)]);
    extras.push(["10yr − 3mo", spread(10, 0.25)]);

    // Inflation is shown whatever else is selected. A yield means little
    // without it, and the real return is the number a lender actually cares
    // about. CPI is monthly, so this is the most recent published reading.
    const inflation = data.context.series.CPIAUCSL?.values[day];
    const tenYear = at(10);
    if (inflation != null) {
      extras.push(["Inflation (CPI)", `${inflation.toFixed(1)}%`]);
      if (tenYear != null) {
        extras.push(["10yr after inflation", signed(tenYear - inflation)]);
      }
    }

    if (state.heightMode !== "level") {
      extras.push(["Height shows", mode.label]);
    }

    const wall = summary?.wall;
    if (wall && wall.id !== "CPIAUCSL") {
      const v = data.context.series[wall.id]?.values[day];
      extras.push([shortName(wall.id), wall.format(v)]);
    }
    if (state.showRecessions && isRecession(data, iso)) {
      extras.push(["NBER", "Recession"]);
    }
    const regime = data.manifest.regimes.find((r) => iso >= r.start && iso <= r.end);
    if (regime && state.showRegimes) extras.push(["Fed program", regime.name]);

    // Events surface here rather than as labels in the scene, so a 36-year
    // view stays clean and the words appear exactly when you look for them.
    const event = nearestEvent(data, iso);

    this.el.innerHTML = `
      <div class="ins-head">
        <span class="ins-date">${longDate(iso)}</span>
        ${this.pinned != null ? '<span class="ins-pin">pinned</span>' : ""}
      </div>
      ${sliceSvg(curve, state, data, day)}
      <div class="ins-grid">${rows}</div>
      ${anyFilled ? '<p class="ins-note">Paler figures were reconstructed, not published.</p>' : ""}
      <dl class="ins-extra">
        ${extras.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}
      </dl>
      ${event ? `<div class="ins-event">
         <b>${escapeHtml(event.title)}</b>
         <span>${escapeHtml(event.note)}</span></div>` : ""}
      <p class="ins-hint">${this.pinned != null
        ? "Click the surface to unpin" : "Click to pin this date"}</p>`;
    this.el.hidden = false;
  }
}

/**
 * The same curve the grid above lists, drawn as a line so the numbers have a
 * shape. Deliberately small: this is a sparkline with axes, not a second chart.
 *
 * It reads tenorCurve, not the resampled 48-point grid, so every point on the
 * line is a figure the reader can find in the grid underneath it. Maturity is
 * warped the same way the 3D surface warps it, so the two agree.
 */
function sliceSvg(curve, state, data, day) {
  const W = 236, H = 76, PL = 4, PR = 4, PT = 8, PB = 12;
  const mode = state.heightMode || "level";

  // Match layers.offsetFor without importing it: the zero plane is the Fed's
  // own rate in vsFunds, and that day's 3-month bill in vs3m.
  let shift = 0;
  if (mode === "vsFunds") {
    const hi = data.context.fedFundsUpper[day], lo = data.context.fedFundsLower[day];
    if (hi == null) return "";
    shift = (hi + (lo == null ? hi : lo)) / 2;
  } else if (mode === "vs3m") {
    const three = curve.find((c) => c.years === 0.25);
    if (!three || three.value == null) return "";
    shift = three.value;
  }

  // Honour the maturity mask, so the slice shows what the surface shows.
  const keep = state.tenors
    ? curve.filter((c, i) => state.tenors.includes(i))
    : curve.slice();
  const pts = keep.filter((c) => c.value != null);
  if (pts.length < 2) return "";

  const warp = data.manifest.warp || 0.32;
  const xs = pts.map((c) => Math.pow(c.years, warp));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const vals = pts.map((c) => c.value - shift);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (mode !== "level") { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  else { lo = Math.min(lo, 0); }
  if (hi - lo < 0.25) { hi += 0.125; lo -= 0.125; }

  const X = (i) => PL + ((xs[i] - x0) / (x1 - x0 || 1)) * (W - PL - PR);
  const Y = (v) => PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PT - PB);

  const line = pts.map((c, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(vals[i]).toFixed(1)}`).join("");
  const dots = pts.map((c, i) =>
    `<circle cx="${X(i).toFixed(1)}" cy="${Y(vals[i]).toFixed(1)}" r="1.7"` +
    `${c.real ? "" : ' class="filled"'}/>`).join("");
  const zero = mode === "level" ? "" :
    `<line class="zero" x1="${PL}" y1="${Y(0).toFixed(1)}" x2="${W - PR}" y2="${Y(0).toFixed(1)}"/>`;

  const first = keep[0], last = keep[keep.length - 1];
  return `<svg class="ins-slice" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="The curve on this day, ${maturityLabel(first.years)} to ${maturityLabel(last.years)}">
      ${zero}<path class="curve" d="${line}"/>${dots}
      <text class="tick" x="${PL}" y="${H - 2}">${maturityLabel(first.years)}</text>
      <text class="tick" x="${W - PR}" y="${H - 2}" text-anchor="end">${maturityLabel(last.years)}</text>
    </svg>`;
}

const pct = (v) => `${v.toFixed(2)}%`;
const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} pp`;

function isRecession(data, iso) {
  return (data.manifest.recessions || []).some(
    (r) => iso >= r.start && iso <= r.end);
}

/** An event within a few days of the cursor, so it is easy to land on. */
function nearestEvent(data, iso) {
  const events = data.manifest.events || [];
  const target = Date.parse(iso);
  let best = null, bestGap = Infinity;
  for (const ev of events) {
    const gap = Math.abs(Date.parse(ev.date) - target) / 86400000;
    if (gap < bestGap) { bestGap = gap; best = ev; }
  }
  return bestGap <= 3 ? best : null;
}

function shortName(id) {
  return {
    WALCL: "Fed balance sheet",
    SP500: "S&P 500",
    NASDAQCOM: "NASDAQ",
    VIXCLS: "VIX",
    THREEFYTP10: "Term premium",
    CPIAUCSL: "Inflation (CPI)",
    T10YIE: "Expected inflation",
    M2SL: "Money supply growth",
    UNRATE: "Unemployment",
  }[id] || id;
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
