/**
 * Ties everything together: loads the data, builds the controls, keeps the URL
 * in step with what is on screen, and runs the render loop.
 */
import * as THREE from "three";
import { load, longDate, monthYear, StaleDataError } from "./data.js";
import { Stage, BOX } from "./scene.js";
import { Layers, HEIGHT_MODES, defaultTenors } from "./layers.js";
import { Inspector } from "./inspector.js";
import { THEMES, initialTheme, remember, applyCss } from "./theme.js";
import { cssGradient } from "./colormap.js";
import * as snapshot from "./snapshot.js";
import { Tour } from "./tour.js";

const $ = (sel) => document.querySelector(sel);

/** Assigned by buildSlider(); repositions the handles after any range change. */
let syncSlider = () => {};

const MIN_SPAN = 15;   // trading days

const TOGGLES = {
  qe:     { key: "showRegimes",    el: "#opt-regimes" },
  rec:    { key: "showRecessions", el: "#opt-recessions" },
  ev:     { key: "showEvents",     el: "#opt-events" },
  ff:     { key: "showFedFunds",   el: "#opt-fedfunds" },
  lines:  { key: "showLines",      el: "#opt-lines" },
  infl:   { key: "showInflation",  el: "#opt-inflation" },
};

/**
 * Embedded mode is requested with ?embed=1 on the iframe's src, which keeps it
 * out of the hash where the view state lives. Everything else still works: the
 * embedder picks the period through the usual parameters and the reader can
 * rotate, zoom and read the surface.
 */
const EMBEDDED = new URLSearchParams(location.search).get("embed") === "1";

const state = {
  from: 0,
  to: 0,
  heightMode: "level",
  contextSeries: "none",
  view: "default",
  theme: "dark",
  preset: null,
  // All off. A first-time visitor should meet one surface and one idea; every
  // layer after that is a question they chose to ask.
  showRegimes: false,
  showRecessions: false,
  showEvents: false,
  showFedFunds: false,
  showLines: false,
  showInflation: false,     // a second reading of the chart, not the default
  legendOpen: true,
  tenors: null,          // null means every maturity
};

let data, stage, layers, inspector, summary;
let dirty = true;
let extraLabels = [];
let cursorDay = null;
// Playing walks a cursor through the window. from/to never move, because
// changing them rebuilds the mesh and a rebuild per frame stutters.
const play = { on: false, perSecond: 12, carry: 0, last: 0 };
let syncPlay = () => {};
// A day named in the URL, applied once the scene exists. Lets a link open with
// a specific date already read out, which is how you point someone at a day
// rather than at a chart and a date to go find.
let pendingPin = null;
let toastTimer = null;

init().catch(showError);

async function init() {
  requireWebGL();

  try {
    data = await load();
  } catch (err) {
    if (!(err instanceof StaleDataError)) throw err;
    // A cache somewhere handed back a mismatched set. Clear it and try once.
    if (window.caches) {
      await caches.keys().then((k) => Promise.all(k.map((n) => caches.delete(n))))
        .catch(() => {});
    }
    data = await load();
  }

  state.theme = initialTheme();
  applyCss(THEMES[state.theme]);
  if (window.matchMedia("(max-width: 820px)").matches) state.legendOpen = false;
  if (EMBEDDED) {
    document.documentElement.dataset.embed = "1";
    // A frame is usually short, and the legend is the first thing to go.
    if (window.innerHeight < 520) state.legendOpen = false;
  }

  state.from = 0;
  state.to = data.rows - 1;
  // Preset 0 is the rolling recent window the pipeline builds, so a first-time
  // visitor lands on what the curve is doing now rather than on history.
  const restored = readUrl();
  if (!restored) applyPreset(0, false);

  stage = new Stage($("#scene"), $("#labels"), THEMES[state.theme]);
  layers = new Layers(stage, data, THEMES[state.theme]);
  inspector = new Inspector($("#inspector"), data);

  buildPresets();
  buildSlider();
  buildToggles();
  buildViews();
  buildSnapshotMenu();
  buildTour();
  buildPlay();
  buildJump();
  buildTenorPicker();
  buildLegend();
  buildKeys();
  $("#legend-bar").style.background = cssGradient();
  $("#stamp").textContent = `Data through ${monthYear(data.manifest.lastDate)}.`;

  syncControls();

  // Two saved links usually differ only after the "#", and a fragment-only
  // navigation does not reload the page, so readUrl never ran a second time:
  // pasting a link into a tab that already had the site open changed the
  // address bar and nothing else. writeUrl uses replaceState, which does not
  // fire this event, so there is no loop.
  window.addEventListener("hashchange", () => {
    if (!readUrl()) return;
    clearPreset();
    syncControls();
    const theme = THEMES[state.theme];
    stage.setTheme(theme);
    layers.setTheme(theme);
    $("#legend-bar").style.background = cssGradient();
    stage.goTo(state.view, true);
    dirty = true;
    applyPendingPin();
  });

  // Reveal and size the canvas before framing the camera, otherwise the
  // aspect ratio is still zero and the opening shot is mis-framed.
  $("#app").hidden = false;
  stage.resize();
  stage.goTo(state.view, true);
  $("#loading").classList.add("done");

  applyPendingPin();

  // Draw one frame straight away rather than waiting for the animation loop.
  // Browsers do not schedule animation frames for an iframe that is scrolled
  // out of view, so an embedded chart placed below the fold would otherwise
  // sit blank until the reader reached it.
  rebuild();
  dirty = false;
  stage.lastExtraLabels = extraLabels;
  stage.render(extraLabels);

  // A handle for poking at the scene from the browser console.
  window.yieldCurve = {
    state, stage, layers, data,
    // Synchronous, so it still works from the console when the tab is in the
    // background and animation frames have stopped being scheduled.
    redraw: () => { rebuild(); dirty = false; stage.render(extraLabels); },
    play, startPlay, stopPlay, seekTo, advancePlayhead,
    snapshotImage, runSnapshot,
  };

  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------- render */
function frame() {
  if (play.on) advancePlayhead();
  if (dirty) {
    rebuild();
    dirty = false;
  }
  stage.lastExtraLabels = extraLabels;
  stage.render(extraLabels);
  requestAnimationFrame(frame);
}

/**
 * Step the playhead by wall-clock time rather than by frame, so the speed is
 * the same on a 60Hz laptop and a 120Hz phone. Only the cursor moves: no
 * rebuild, no mesh work.
 */
function advancePlayhead() {
  const now = performance.now();
  const dt = Math.min(250, now - play.last);     // a backgrounded tab should
  play.last = now;                                // not sprint on return
  play.carry += (dt / 1000) * play.perSecond;
  const steps = Math.floor(play.carry);
  if (steps < 1) return;
  play.carry -= steps;

  const next = Math.min(state.to, (cursorDay == null ? state.from : cursorDay) + steps);
  cursorDay = next;
  inspector.pinned = next;                        // so the panel does not blink
  layers.setCursor(next);
  inspector.show(next, state, summary);
  if (next >= state.to) stopPlay();
}

function startPlay() {
  if (state.to - state.from < 1) return;
  const at = inspector.pinned;
  cursorDay = at != null && at >= state.from && at < state.to ? at : state.from;
  play.on = true;
  play.carry = 0;
  play.last = performance.now();
  inspector.pinned = cursorDay;
  layers.setCursor(cursorDay);
  inspector.show(cursorDay, state, summary);
  syncPlay();
}

/** Leaves the last day pinned, which is what you want at the end of a run. */
function stopPlay() {
  if (!play.on) return;
  play.on = false;
  syncPlay();
  writeUrl();
}

/**
 * Put a day under the cursor and pin it, sliding the window if the day sits
 * outside it. The span is preserved: jumping somewhere should not silently
 * widen the range to all of history.
 */
function seekTo(day, { slide = true } = {}) {
  if (day == null) return false;
  stopPlay();
  if (day < state.from || day > state.to) {
    if (!slide) return false;
    const span = state.to - state.from;
    // Two thirds along, so there is history behind the day and a little ahead.
    let from = Math.round(day - span * 0.66);
    from = Math.max(0, Math.min(from, data.rows - 1 - span));
    state.from = from;
    state.to = from + span;
    clearPreset();
    syncSlider();
    dirty = true;
  }
  cursorDay = day;
  inspector.pinned = day;
  layers.setCursor(day);
  inspector.show(day, state, summary);
  writeUrl();
  return true;
}

function rebuild() {
  summary = layers.update(state);
  const mode = HEIGHT_MODES[state.heightMode];
  stage.buildFrame(summary.grid, layers.timeMarks(summary.rows), mode.unit,
                   summary.maturityTicks);

  extraLabels = summary.regimeLabels.slice();
  if (summary.ff) {
    extraLabels.push({
      p: [BOX.FF_X, stage.y(summary.ff.latest - layers.offsetFor(state.heightMode, state.to)) + 4.5, BOX.D],
      text: "Fed funds", cls: "axis-title",
    });
  }
  if (summary.wall) {
    extraLabels.push({
      p: [BOX.WALL_X, summary.wall.wallTop + 5, BOX.D * 0.5],
      text: shortSeriesName(), cls: "axis-title",
    });
    $("#context-note").textContent = contextCaption(summary.wall);
  } else {
    $("#context-note").textContent = state.contextSeries === "none"
      ? "The back wall is empty."
      : "No data for this series in the selected range.";
  }
  if (summary.inflation) {
    extraLabels.push({
      p: [summary.inflation.x + 3,
          stage.y(summary.inflation.high - layers.offsetFor(state.heightMode, state.to)) + 3,
          BOX.D * 0.25],
      text: "Inflation (CPI)", cls: "axis-title",
    });
  }
  if (state.showRecessions && (data.manifest.recessions || []).some(
      (r) => r.end >= data.dates[state.from] && r.start <= data.dates[state.to])) {
    extraLabels.push({
      p: [(BOX.RAIL_X0 + BOX.RAIL_X1) / 2 + 8, stage.y(stage.valueMin) + 1.5, BOX.D * 0.5],
      text: "Recessions", cls: "era",
    });
  }

  layers.setCursor(cursorDay);
  updateLegend();
  updateRangeReadout();
  updateEventList(summary.events);
  $("#height-note").textContent = mode.note;
  if (cursorDay != null) inspector.show(cursorDay, state, summary);
  writeUrl();
}

/* ---------------------------------------------------------------- state */
function readUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (![...params.keys()].length) return false;
  const from = params.get("from"), to = params.get("to");
  if (from && to) {
    state.from = data.indexOf(from);
    state.to = Math.min(data.rows - 1, data.indexOf(to));
    if (state.to - state.from < MIN_SPAN) state.to = Math.min(data.rows - 1, state.from + MIN_SPAN);
  }
  if (HEIGHT_MODES[params.get("m")]) state.heightMode = params.get("m");
  if (params.get("w")) state.contextSeries = params.get("w");
  if (params.get("v")) state.view = params.get("v");
  if (params.get("t") === "light" || params.get("t") === "dark") state.theme = params.get("t");
  // A link without tn means every maturity. Leaving the old selection in place
  // made one link inherit the last one's trimmed axis, which is invisible
  // until you notice the surface stops at ten years.
  state.tenors = null;
  if (params.has("tn")) {
    const mask = parseInt(params.get("tn"), 10);
    if (Number.isFinite(mask)) {
      const picked = [];
      for (let i = 0; i < data.tenorCount; i++) if ((mask >> i) & 1) picked.push(i);
      if (picked.length >= 2) state.tenors = picked;
    }
  }
  pendingPin = params.get("d") || null;
  if (params.get("lg") === "0") state.legendOpen = false;
  if (params.get("lg") === "1") state.legendOpen = true;
  if (params.has("s")) {
    const on = new Set(params.get("s").split(",").filter(Boolean));
    for (const [code, spec] of Object.entries(TOGGLES)) state[spec.key] = on.has(code);
  }
  applyCss(THEMES[state.theme]);
  return true;
}

/** An iframe snippet reproducing the current view, for a publisher to paste. */
function embedSnippet() {
  const url = new URL(currentUrl());
  url.search = "?embed=1";
  return `<iframe src="${url}" width="100%" height="560" style="border:0;` +
    `border-radius:8px" loading="lazy" title="The Shape of Money: ` +
    `US Treasury yield curve" allowfullscreen></iframe>`;
}

function currentUrl() {
  const params = new URLSearchParams();
  params.set("from", data.dates[state.from]);
  params.set("to", data.dates[state.to]);
  params.set("m", state.heightMode);
  params.set("w", state.contextSeries);
  params.set("v", state.view);
  params.set("t", state.theme);
  params.set("s", Object.entries(TOGGLES)
    .filter(([, spec]) => state[spec.key]).map(([code]) => code).join(","));
  if (state.tenors) {
    params.set("tn", String(state.tenors.reduce((m, i) => m | (1 << i), 0)));
  }
  if (!state.legendOpen) params.set("lg", "0");
  // Only a deliberately pinned day travels in the link; a hover does not.
  if (inspector && inspector.pinned != null) {
    params.set("d", data.dates[inspector.pinned]);
  }
  return `${location.origin}${location.pathname}#${params}`;
}

function writeUrl() {
  if (EMBEDDED) return;
  history.replaceState(null, "", `#${currentUrl().split("#")[1]}`);
}

/* -------------------------------------------------------------- presets */
const indexOfPreset = (name) =>
  data.manifest.presets.findIndex((p) => p.name === name);

function buildPresets() {
  const host = $("#presets");
  data.manifest.presets.forEach((preset, i) => {
    const btn = document.createElement("button");
    btn.textContent = preset.name;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => applyPreset(i));
    host.appendChild(btn);
  });
}

function applyPreset(index, redraw = true) {
  stopPlay();
  if (index < 0) index = 0;
  const preset = data.manifest.presets[index];
  state.from = data.indexOf(preset.start);
  state.to = Math.min(data.rows - 1, data.indexOf(preset.end));
  if (state.to - state.from < MIN_SPAN) state.to = state.from + MIN_SPAN;
  state.preset = index;
  if (!redraw) return;
  $("#preset-note").textContent = preset.note;
  markPreset();
  syncSlider();
  dirty = true;
}

function markPreset() {
  $("#presets").querySelectorAll("button").forEach((btn, i) => {
    btn.setAttribute("aria-pressed", String(i === state.preset));
  });
}

function clearPreset() {
  if (state.preset === null) return;
  state.preset = null;
  $("#preset-note").textContent = "";
  markPreset();
}

/* --------------------------------------------------------------- slider */
function buildSlider() {
  const el = $("#slider");
  const fill = el.querySelector(".fill");
  const handles = {
    lo: el.querySelector('[data-handle="lo"]'),
    hi: el.querySelector('[data-handle="hi"]'),
  };
  const posFor = (index) => (index / (data.rows - 1)) * 100;

  syncSlider = () => {
    handles.lo.style.left = `${posFor(state.from)}%`;
    handles.hi.style.left = `${posFor(state.to)}%`;
    fill.style.left = `${posFor(state.from)}%`;
    fill.style.width = `${posFor(state.to) - posFor(state.from)}%`;
  };

  const indexAt = (clientX) => {
    const rect = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(f * (data.rows - 1));
  };

  const setHandle = (which, index) => {
    stopPlay();
    if (which === "lo") {
      state.from = Math.max(0, Math.min(index, state.to - MIN_SPAN));
    } else {
      state.to = Math.min(data.rows - 1, Math.max(index, state.from + MIN_SPAN));
    }
    clearPreset();
    syncSlider();
    dirty = true;
  };

  for (const which of ["lo", "hi"]) {
    const handle = handles[which];
    handle.addEventListener("pointerdown", (ev) => {
      handle.setPointerCapture(ev.pointerId);
      const move = (e) => setHandle(which, indexAt(e.clientX));
      const up = () => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      ev.preventDefault();
    });

    // Keyboard: arrows step a day, shift-arrows a month, page keys a year.
    handle.addEventListener("keydown", (ev) => {
      const steps = { ArrowLeft: -1, ArrowRight: 1, PageDown: -252, PageUp: 252 };
      let step = steps[ev.key];
      if (step === undefined) return;
      if (ev.shiftKey) step *= 21;
      setHandle(which, (which === "lo" ? state.from : state.to) + step);
      ev.preventDefault();
    });
  }

  // Dragging the middle slides the whole window without changing its length,
  // which is how you walk a fixed span forward through history.
  fill.addEventListener("pointerdown", (ev) => {
    fill.setPointerCapture(ev.pointerId);
    const grabbed = indexAt(ev.clientX);
    const span = state.to - state.from;
    const startFrom = state.from;

    const move = (e) => {
      const shift = indexAt(e.clientX) - grabbed;
      const from = Math.max(0, Math.min(data.rows - 1 - span, startFrom + shift));
      if (from === state.from) return;
      state.from = from;
      state.to = from + span;
      clearPreset();
      syncSlider();
      dirty = true;
    };
    const up = () => {
      fill.releasePointerCapture(ev.pointerId);
      fill.removeEventListener("pointermove", move);
      fill.removeEventListener("pointerup", up);
    };
    fill.addEventListener("pointermove", move);
    fill.addEventListener("pointerup", up);
    ev.preventDefault();
    ev.stopPropagation();
  });

  // Arrow keys nudge the whole window when the middle has focus.
  fill.addEventListener("keydown", (ev) => {
    const steps = { ArrowLeft: -1, ArrowRight: 1, PageDown: -252, PageUp: 252 };
    let step = steps[ev.key];
    if (step === undefined) return;
    if (ev.shiftKey) step *= 21;
    const span = state.to - state.from;
    const from = Math.max(0, Math.min(data.rows - 1 - span, state.from + step));
    state.from = from;
    state.to = from + span;
    clearPreset();
    syncSlider();
    dirty = true;
    ev.preventDefault();
  });

  el.addEventListener("pointerdown", (ev) => {
    if (ev.target.classList.contains("handle") || ev.target.classList.contains("fill")) return;
    const index = indexAt(ev.clientX);
    setHandle(Math.abs(index - state.from) < Math.abs(index - state.to) ? "lo" : "hi", index);
  });

  syncSlider();
}

function updateRangeReadout() {
  $("#range-lo").textContent = monthYear(data.dates[state.from]);
  $("#range-hi").textContent = monthYear(data.dates[state.to]);
  const days = state.to - state.from + 1;
  const years = days / 252;
  $("#range-span").textContent =
    years >= 1.4 ? `${years.toFixed(1)} years` : `${Math.round(days / 21)} months`;
}

/* -------------------------------------------------------------- controls */
function syncControls() {
  for (const spec of Object.values(TOGGLES)) $(spec.el).checked = state[spec.key];
  $("#height-mode").value = state.heightMode;
  $("#context-series").value = state.contextSeries;
  if (state.preset !== null) {
    $("#preset-note").textContent = data.manifest.presets[state.preset].note;
  }
  markPreset();
  syncSlider();
  syncTenorPicker();
}

function buildToggles() {
  for (const spec of Object.values(TOGGLES)) {
    const el = $(spec.el);
    el.addEventListener("change", () => { state[spec.key] = el.checked; dirty = true; });
  }

  $("#height-mode").addEventListener("change", (ev) => {
    state.heightMode = ev.target.value;
    dirty = true;
  });
  $("#context-series").addEventListener("change", (ev) => {
    state.contextSeries = ev.target.value;
    dirty = true;
  });

  $("#theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    const theme = THEMES[state.theme];
    applyCss(theme);
    remember(state.theme);
    stage.setTheme(theme);
    layers.setTheme(theme);
    dirty = true;
  });

  const collapse = () => {
    $("#app").classList.toggle("collapsed");
    setTimeout(() => stage.resize(), 320);
  };
  $("#panel-toggle").addEventListener("click", collapse);
  $("#stage").addEventListener("dblclick", (ev) => {
    if (ev.target.id === "scene") collapse();
  });

  buildCursor();
}

/**
 * One checkbox per maturity, plus a select-all. Two is the minimum: a surface
 * needs at least two knots to interpolate between.
 */
function buildTenorPicker() {
  const host = $("#tenor-list");
  const all = $("#tenor-all");
  const boxes = [];

  data.tenorLabels.forEach((label, i) => {
    const wrap = document.createElement("label");
    wrap.className = "check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    box.dataset.tenor = String(i);
    wrap.append(box, document.createTextNode(` ${label.replace(" Month", " mo")}`));
    host.appendChild(wrap);
    boxes.push(box);
  });

  const selection = () => boxes.reduce((out, b, i) => (b.checked && out.push(i), out), []);

  const commit = () => {
    const picked = selection();
    if (picked.length < 2) return false;
    state.tenors = picked.length === boxes.length ? null : picked;
    all.checked = picked.length === boxes.length;
    all.indeterminate = picked.length > 0 && picked.length < boxes.length;
    dirty = true;
    return true;
  };

  host.addEventListener("change", (ev) => {
    const box = ev.target;
    if (!box.dataset.tenor) return;
    if (!commit()) {
      box.checked = true;         // refuse to drop below two maturities
      toast("Keep at least two maturities");
    }
  });

  all.addEventListener("change", () => {
    // "None" would leave nothing to draw, so clearing falls back to the two
    // ends of the curve, which is the smallest surface that still means
    // something.
    const on = all.checked;
    boxes.forEach((b, i) => {
      b.checked = on || i === 0 || i === boxes.length - 1;
    });
    commit();
  });

  syncTenorPicker = () => {
    const picked = state.tenors || defaultTenors(boxes.length);
    boxes.forEach((b, i) => { b.checked = picked.includes(i); });
    all.checked = picked.length === boxes.length;
    all.indeterminate = picked.length < boxes.length;
  };
  syncTenorPicker();
}

let syncTenorPicker = () => {};

/**
 * The walkthrough drives the chart as it explains it, so it gets a small
 * command surface rather than reaching into the state object itself.
 */
function buildTour() {
  const tour = new Tour($("#stage"), {
    apply(change) {
      if (change.preset) applyPreset(indexOfPreset(change.preset));
      if (change.heightMode) {
        state.heightMode = change.heightMode;
        $("#height-mode").value = change.heightMode;
      }
      if (change.show) {
        for (const [key, value] of Object.entries(change.show)) {
          state[key] = value;
          const spec = Object.values(TOGGLES).find((t) => t.key === key);
          if (spec) $(spec.el).checked = value;
        }
      }
      if (change.contextSeries) {
        state.contextSeries = change.contextSeries;
        $("#context-series").value = change.contextSeries;
      }
      if (change.view) {
        state.view = change.view;
        stage.goTo(change.view);
      }
      dirty = true;
    },
  });

  $("#tour-btn").addEventListener("click", () => tour.start());

  // Never in an embed: a publisher's readers did not ask for a walkthrough.
  if (!EMBEDDED && Tour.unseen()) setTimeout(() => tour.start(), 700);
}

function buildPlay() {
  const btn = $("#play-toggle");
  const speed = $("#play-speed");

  syncPlay = () => {
    btn.textContent = play.on ? "Pause" : "Play";
    btn.setAttribute("aria-pressed", String(play.on));
  };

  btn.addEventListener("click", () => (play.on ? stopPlay() : startPlay()));

  // Changing speed mid-run should not jump the playhead, so only the rate
  // changes and the part-step in hand is dropped.
  speed.addEventListener("click", (ev) => {
    const pick = ev.target.closest("button[data-speed]");
    if (!pick) return;
    play.perSecond = Number(pick.dataset.speed) || 12;
    play.carry = 0;
    for (const b of speed.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b === pick));
    }
  });
  syncPlay();
}

/**
 * The slider is the wrong tool for "show me 18 March 2009". Snap whatever the
 * picker gives us to the nearest trading day, then hand it to seekTo.
 */
function buildJump() {
  const input = $("#jump-date");
  input.min = data.dates[0];
  input.max = data.dates[data.rows - 1];

  // One jump per value per visit to the field. Refocusing clears it, so
  // returning to the same date after moving the window still works.
  let applied = "";

  // force skips the repeat guard: Enter is someone asking for it explicitly,
  // where change and blur are just the field settling.
  const go = (force = false) => {
    const iso = input.value;
    if (!iso || (iso === applied && !force)) return;
    if (iso < data.dates[0] || iso > data.dates[data.rows - 1]) {
      toast(`The record runs ${longDate(data.dates[0])} to ` +
            `${longDate(data.dates[data.rows - 1])}.`);
      return;
    }
    const day = data.indexOf(iso);            // nearest trading day at or after
    if (day == null) { toast("No trading day near that date."); return; }
    applied = iso;
    seekTo(day);
    if (data.dates[day] !== iso) toast(`Nearest trading day: ${longDate(data.dates[day])}.`);
  };

  input.addEventListener("focus", () => { applied = ""; });

  // Three ways in, because the native date picker is a browser widget rather
  // than part of the page. While its calendar is open it takes the keys, so a
  // keydown listener here never sees Enter and the browser moves focus on
  // instead. Whatever happens, focus eventually leaves the field, so blur is
  // the one signal that always arrives.
  input.addEventListener("change", () => go());   // calendar committed a date
  input.addEventListener("blur", () => go());     // clicked away, or focus moved
  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();                     // do not hand Enter to the page
    go(true);
    input.blur();                            // closes the picker, marks it taken
  });
}

function buildViews() {
  $(".views").addEventListener("click", (ev) => {
    const name = ev.target.dataset?.view;
    if (!name) return;
    state.view = name;
    stage.goTo(name);
    writeUrl();
  });
}

/* --------------------------------------------------------------- legend */
function buildLegend() {
  const toggle = $("#legend-toggle");
  const apply = () => {
    $("#legend-box").classList.toggle("closed", !state.legendOpen);
    toggle.setAttribute("aria-expanded", String(state.legendOpen));
  };
  toggle.addEventListener("click", () => {
    state.legendOpen = !state.legendOpen;
    apply();
    writeUrl();
  });
  apply();
}

function updateLegend() {
  const mode = HEIGHT_MODES[state.heightMode];
  $("#legend-title").textContent = mode.label;
  $("#legend-bar").style.background = cssGradient(mode.ramp);

  // Only mention reconstructed data when some is actually on screen.
  $("#legend-recon").hidden = !summary.anyFilled;
  updateLegendKeys();

  const host = $("#legend-ticks");
  host.innerHTML = "";
  const steps = 5;
  const lo = mode.ramp === "diverging" ? -summary.colorAbs : 0;
  const hi = mode.ramp === "diverging" ? summary.colorAbs : summary.colorMax;
  for (let i = 0; i < steps; i++) {
    const v = lo + ((hi - lo) * i) / (steps - 1);
    const span = document.createElement("span");
    span.textContent = `${v > 0 && lo < 0 ? "+" : ""}${v.toFixed(1)}`;
    host.appendChild(span);
  }
}

/**
 * A key for everything currently drawn, and nothing that is not.
 *
 * The color ramp only ever explained the surface. The ribbon, the sheet, the
 * bands, the shading and the markers all carry meaning in colour and none of
 * them said so anywhere.
 */
function updateLegendKeys() {
  const theme = THEMES[state.theme];
  const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
  const keys = [];

  if (state.showFedFunds) {
    keys.push([hex(theme.fedFunds), "Fed funds target, along the front edge", false]);
  }
  if (state.showInflation && summary.inflation) {
    keys.push([hex(theme.inflationSheet),
               "Inflation (CPI, year on year) as sea level", false]);
  }
  if (summary.wall) {
    keys.push([hex(summary.wall.style.color), `${shortSeriesName()}, on the back wall`, false]);
  }
  if (state.showRegimes) {
    keys.push(["linear-gradient(90deg,#3aa8e0,#e05a5a)",
               "Fed bond buying (blue) and selling (red)", false]);
  }
  if (state.showRecessions) {
    keys.push([hex(theme.recessionRail), "Recessions, as shading on the surface", false]);
  }
  if (state.showEvents) {
    keys.push([hex(theme.eventMark), "Notable days", false]);
  }
  if (state.showLines) {
    const stride = summary.curveStride || 1;
    keys.push(["currentColor", stride === 1
      ? "One line per trading day"
      : `One line every ${stride} trading days`, true]);
  }

  const host = $("#legend-keys");
  host.innerHTML = keys.map(([color, label, isLine]) =>
    `<li><span class="k${isLine ? " line" : ""}" style="background:${color}"></span>` +
    `${escapeHtml(label)}</li>`).join("");
  host.hidden = keys.length === 0;
}

function shortSeriesName() {
  return {
    WALCL: "Fed balance sheet", SP500: "S&P 500", NASDAQCOM: "NASDAQ Composite",
    VIXCLS: "VIX", THREEFYTP10: "Term premium",
    CPIAUCSL: "Inflation (CPI)", T10YIE: "Expected inflation (breakeven)",
    M2SL: "Money supply growth", UNRATE: "Unemployment rate",
  }[state.contextSeries] || "";
}

/**
 * Pin the day named by ?d= in the URL, if it is inside the current range.
 * Runs after the scene is built, because pinning draws the crosshair and the
 * readout panel, neither of which exists while the URL is first parsed.
 */
function applyPendingPin() {
  if (!pendingPin) return;
  const iso = pendingPin;
  pendingPin = null;
  const day = data.indexOf(iso);
  if (day == null || day < state.from || day > state.to) return;
  cursorDay = day;
  inspector.pinned = day;
  layers.setCursor(day);
  inspector.show(day, state, summary);
}

function contextCaption(wall) {
  const change = wall.changePct;
  const base = `${wall.firstText} → ${wall.lastText} over this range`;
  if (change === null || !isFinite(change) || wall.style.rate) return `${base}.`;
  return `${base}, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(0)}%.`;
}

/* --------------------------------------------------------------- events */
function updateEventList(events) {
  const host = $("#events-list");
  host.innerHTML = "";
  $("#events-count").textContent = events.length ? `${events.length}` : "";
  if (!events.length) {
    host.innerHTML = '<p class="empty">No marked events in this range.</p>';
    return;
  }
  for (const ev of events) {
    const btn = document.createElement("button");
    btn.innerHTML = `<b>${escapeHtml(ev.title)}</b><time>${longDate(ev.date)}</time>`;
    // Already a <button>, so Enter and Space work without extra handling.
    // seekTo adds the window slide for a day outside the current range.
    btn.addEventListener("click", () => seekTo(data.indexOf(ev.date)));
    host.appendChild(btn);
  }
}

/* ---------------------------------------------------------------- cursor */
/**
 * The cursor picks a date, not a point. Rays that miss the surface fall
 * through to an invisible floor plane, so sliding along the empty part of the
 * box still scrubs through time.
 */
function buildCursor() {
  const canvas = $("#scene");
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const local = new THREE.Vector3();

  const dateAt = (ev) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, stage.camera);
    const hits = raycaster.intersectObjects([layers.surface, stage.pickPlane], false);
    if (!hits.length) return null;
    local.copy(hits[0].point);
    stage.world.worldToLocal(local);
    const rows = layers.rows;
    const slot = clamp(Math.round((local.z / BOX.D) * (rows.length - 1)), 0, rows.length - 1);
    return rows[slot];
  };

  // Rotating the scene should not also scrub the date, and letting go after a
  // rotation should not count as a click. Track the drag so both stay out of
  // the way. This matters most on a phone, where every gesture is a drag.
  let dragging = false;
  let downAt = null;

  canvas.addEventListener("pointerdown", (ev) => {
    dragging = true;
    downAt = { x: ev.clientX, y: ev.clientY };
  });

  // A rotation stops playback. A tap does not, so tapping to pin mid-run still
  // behaves like pinning rather than like an accidental stop.
  canvas.addEventListener("pointermove", (ev) => {
    if (!dragging || !play.on || !downAt) return;
    if (Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 4) stopPlay();
  });

  window.addEventListener("pointerup", () => { dragging = false; });

  canvas.addEventListener("pointermove", (ev) => {
    if (dragging || inspector.pinned != null) return;
    const day = dateAt(ev);
    if (day === cursorDay) return;
    cursorDay = day;
    layers.setCursor(day);
    if (day == null) inspector.clear(); else inspector.show(day, state, summary);
  });

  canvas.addEventListener("pointerleave", () => {
    if (inspector.pinned != null) return;
    cursorDay = null;
    layers.setCursor(null);
    inspector.clear();
  });

  // A click pins the date so the pointer can leave without losing the reading.
  canvas.addEventListener("click", (ev) => {
    const moved = downAt
      ? Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) : 0;
    if (moved > 4) return;                     // that was a rotation, not a tap

    if (inspector.pinned != null) {
      inspector.pinned = null;
    } else {
      const day = dateAt(ev);
      if (day == null) return;
      inspector.pinned = day;
      cursorDay = day;
    }
    layers.setCursor(cursorDay);
    if (cursorDay != null) inspector.show(cursorDay, state, summary);
  });
}

/* -------------------------------------------------------------- snapshot */
function buildSnapshotMenu() {
  const toggle = $("#snap-toggle");
  const menu = $("#snap-menu");

  const close = () => { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
  toggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
    toggle.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", close);
  menu.addEventListener("click", (ev) => ev.stopPropagation());

  menu.addEventListener("click", (ev) => {
    const action = ev.target.closest("button")?.dataset.snap;
    if (action) { close(); runSnapshot(action); }
  });
}

function snapshotImage(scale = 2) {
  const range = `${monthYear(data.dates[state.from])} to ${monthYear(data.dates[state.to])}`;
  const mode = HEIGHT_MODES[state.heightMode];
  return snapshot.compose({
    stage,
    theme: THEMES[state.theme],
    title: "The Shape of Money",
    subtitle: `US Treasury yield curve, ${range}` +
      (state.heightMode === "level" ? "" : ` · ${mode.label}`),
    footer: "US Treasury; Federal Reserve Economic Data, St. Louis Fed",
    scale,
  });
}

async function runSnapshot(action) {
  try {
    const stamp = `${data.dates[state.from]}_${data.dates[state.to]}`;
    if (action === "link") return toast(await snapshot.copyLink(currentUrl()));
    if (action === "embed") {
      await snapshot.copyLink(embedSnippet());
      return toast("Embed code copied");
    }
    if (action === "x") {
      return toast(snapshot.shareOnX(currentUrl(),
        "The US Treasury yield curve in 3D — every trading day since 1990"));
    }
    const canvas = snapshotImage(action === "print" ? 2.5 : 2);
    if (action === "download") return toast(await snapshot.download(canvas, `yield-curve-${stamp}.png`));
    if (action === "copy") return toast(await snapshot.copyImage(canvas));
    if (action === "tab") return toast(await snapshot.openInNewTab(canvas));
    if (action === "print") return toast(await snapshot.print(canvas, $("#print-host")));
  } catch (err) {
    toast(err.message || "That did not work");
  }
}

function buildKeys() {
  window.addEventListener("keydown", (ev) => {
    const meta = ev.metaKey || ev.ctrlKey;
    const key = ev.key.toLowerCase();
    const el = document.activeElement;
    const typing = el && (el.tagName === "INPUT" || el.tagName === "SELECT"
                          || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (ev.key === " " && !typing && !meta) {
      ev.preventDefault();
      play.on ? stopPlay() : startPlay();
      return;
    }
    if (key === "s" && meta && ev.altKey) { ev.preventDefault(); runSnapshot("download"); }
    else if (key === "s" && meta && ev.shiftKey) { ev.preventDefault(); runSnapshot("copy"); }
    else if (key === "s" && ev.altKey && !meta) { ev.preventDefault(); runSnapshot("link"); }
    else if (key === "p" && meta) { ev.preventDefault(); runSnapshot("print"); }
    else if (key === "escape") {
      stopPlay();
      inspector.pinned = null;
      cursorDay = null;
      layers.setCursor(null);
      inspector.clear();
      $("#snap-menu").hidden = true;
    }
  });
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------------------------------------------------------------- utils */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const escapeHtml = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * Fail with an explanation rather than a stack trace on the handful of
 * browsers and locked-down devices that have no WebGL.
 */
function requireWebGL() {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (gl) return;
  } catch (err) {
    /* fall through to the message below */
  }
  throw new Error(
    "This browser cannot draw 3D graphics (WebGL is unavailable). " +
    "Try a different browser, or check whether hardware acceleration is " +
    "switched off in your settings."
  );
}

function showError(err) {
  console.error(err);
  $("#loading").innerHTML =
    `<p style="max-width:34rem;text-align:center;line-height:1.6">
       <strong>Could not start.</strong><br>${escapeHtml(err.message)}<br><br>
       <span style="font-size:13px;opacity:.7">
         If you opened this file directly from your computer, the browser blocks
         it from loading the data. Serve the folder instead, for example by
         running <code>python3 -m http.server</code> in it.
       </span>
     </p>`;
}
