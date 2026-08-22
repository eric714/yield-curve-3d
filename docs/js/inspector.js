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
    if (funds) extras.push(["Fed funds target", funds]);
    extras.push(["10yr − 2yr", spread(10, 2)]);
    extras.push(["10yr − 3mo", spread(10, 0.25)]);
    if (state.heightMode !== "level") {
      extras.push(["Height shows", mode.label]);
    }

    const wall = summary?.wall;
    if (wall) {
      const v = data.context.series[wall.id]?.values[day];
      extras.push([shortName(wall.id), wall.format(v)]);
    }
    if (state.showRecessions && isRecession(data, iso)) {
      extras.push(["NBER", "Recession"]);
    }
    const regime = data.manifest.regimes.find((r) => iso >= r.start && iso <= r.end);
    if (regime && state.showRegimes) extras.push(["Fed programme", regime.name]);

    // Events surface here rather than as labels in the scene, so a 36-year
    // view stays clean and the words appear exactly when you look for them.
    const event = nearestEvent(data, iso);

    this.el.innerHTML = `
      <div class="ins-head">
        <span class="ins-date">${longDate(iso)}</span>
        ${this.pinned != null ? '<span class="ins-pin">pinned</span>' : ""}
      </div>
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
  return bestGap <= 4 ? best : null;
}

function shortName(id) {
  return {
    WALCL: "Fed balance sheet",
    SP500: "S&P 500",
    NASDAQCOM: "NASDAQ",
    VIXCLS: "VIX",
    THREEFYTP10: "Term premium",
  }[id] || id;
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
