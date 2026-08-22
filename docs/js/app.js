/**
 * Ties everything together: loads the data, builds the controls, and runs the
 * render loop.
 */
import * as THREE from "three";
import { load, longDate, maturityLabel, monthYear, pct } from "./data.js";
import { Stage, BOX } from "./scene.js";
import { Layers } from "./layers.js";
import { cssGradient } from "./colormap.js";

const $ = (sel) => document.querySelector(sel);

/** Assigned by buildSlider(); repositions the handles after any range change. */
let syncSlider = () => {};

const state = {
  from: 0,
  to: 0,
  showRegimes: true,
  showFedFunds: true,
  showLines: true,
  showRecon: true,
  contextSeries: "WALCL",
  preset: null,
};

const MIN_SPAN = 15;   // trading days

let data, stage, layers, summary;
let dirty = true;
let extraLabels = [];

init().catch(showError);

async function init() {
  data = await load();

  stage = new Stage($("#scene"), $("#labels"));
  layers = new Layers(stage, data);

  state.from = 0;
  state.to = data.rows - 1;

  buildPresets();
  buildSlider();
  buildToggles();
  buildViews();
  buildLegendSwatch();
  buildProbe();

  $("#stamp").textContent =
    `Updated ${monthYear(data.manifest.lastDate)}.`;

  // Open on the global financial crisis. It is the most striking stretch in
  // the whole series and it makes the controls self-explanatory.
  applyPreset(data.manifest.presets.findIndex((p) => p.name === "Global financial crisis"));

  // Reveal and size the canvas before framing the camera, otherwise the
  // aspect ratio is still zero and the opening shot is mis-framed.
  $("#app").hidden = false;
  stage.resize();
  stage.goTo("default", true);
  $("#loading").classList.add("done");
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------- render */
function frame() {
  if (dirty) {
    rebuild();
    dirty = false;
  }
  stage.render(extraLabels);
  requestAnimationFrame(frame);
}

function rebuild() {
  summary = layers.update(state);
  stage.buildFrame(data.maturities, layers.timeMarks(summary.rows));

  extraLabels = summary.regimeLabels.slice();

  if (summary.ff) {
    extraLabels.push({
      p: [-8, stage.y(summary.ff.latest) + 4.5, BOX.D],
      text: "Fed funds",
      cls: "axis-title",
    });
  }
  if (summary.wall) {
    extraLabels.push({
      p: [summary.wall.wallX, summary.wall.wallTop + 5, BOX.D * 0.5],
      text: shortSeriesName(),
      cls: "axis-title",
    });
    $("#context-note").textContent = contextCaption(summary.wall);
  } else {
    $("#context-note").textContent = state.contextSeries === "none"
      ? "The back wall is empty."
      : "No data for this series in the selected range.";
  }

  updateLegend(summary.colourMax);
  updateRangeReadout();
}

/* -------------------------------------------------------------- presets */
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

function applyPreset(index) {
  if (index < 0) index = 0;
  const preset = data.manifest.presets[index];
  state.from = data.indexOf(preset.start);
  state.to = Math.min(data.rows - 1, data.indexOf(preset.end));
  if (state.to - state.from < MIN_SPAN) state.to = state.from + MIN_SPAN;
  state.preset = index;
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
    if (which === "lo") {
      state.from = Math.min(index, state.to - MIN_SPAN);
      state.from = Math.max(0, state.from);
    } else {
      state.to = Math.max(index, state.from + MIN_SPAN);
      state.to = Math.min(data.rows - 1, state.to);
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
      const up = (e) => {
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
      const current = which === "lo" ? state.from : state.to;
      setHandle(which, current + step);
      ev.preventDefault();
    });
  }

  // Clicking the track moves the nearer handle.
  el.addEventListener("pointerdown", (ev) => {
    if (ev.target.classList.contains("handle")) return;
    const index = indexAt(ev.clientX);
    const which = Math.abs(index - state.from) < Math.abs(index - state.to) ? "lo" : "hi";
    setHandle(which, index);
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

/* -------------------------------------------------------------- toggles */
function buildToggles() {
  const map = {
    "#opt-regimes": "showRegimes",
    "#opt-fedfunds": "showFedFunds",
    "#opt-lines": "showLines",
    "#opt-recon": "showRecon",
  };
  for (const [sel, key] of Object.entries(map)) {
    const el = $(sel);
    el.checked = state[key];
    el.addEventListener("change", () => { state[key] = el.checked; dirty = true; });
  }

  const select = $("#context-series");
  select.value = state.contextSeries;
  select.addEventListener("change", () => {
    state.contextSeries = select.value;
    dirty = true;
  });

  const toggle = $("#panel-toggle");
  toggle.addEventListener("click", () => {
    $("#app").classList.toggle("collapsed");
    setTimeout(() => stage.resize(), 320);
  });
  // A double-click on empty stage also collapses the panel.
  $("#stage").addEventListener("dblclick", (ev) => {
    if (ev.target.id !== "scene") return;
    $("#app").classList.toggle("collapsed");
    setTimeout(() => stage.resize(), 320);
  });
}

function buildViews() {
  $(".views").addEventListener("click", (ev) => {
    const name = ev.target.dataset?.view;
    if (name) stage.goTo(name);
  });
}

/* --------------------------------------------------------------- legend */
function buildLegendSwatch() {
  $("#legend-bar").style.background = cssGradient();
}

function updateLegend(max) {
  const host = $("#legend-ticks");
  const steps = 5;
  host.innerHTML = "";
  for (let i = 0; i < steps; i++) {
    const span = document.createElement("span");
    span.textContent = `${((max * i) / (steps - 1)).toFixed(1)}%`;
    host.appendChild(span);
  }
}

function shortSeriesName() {
  return {
    WALCL: "Fed balance sheet",
    NASDAQCOM: "NASDAQ Composite",
    VIXCLS: "VIX",
    SP500: "S&P 500",
  }[state.contextSeries] || "";
}

function contextCaption(wall) {
  const change = wall.changePct;
  if (change === null || !isFinite(change)) return wall.label;
  const dir = change >= 0 ? "up" : "down";
  return `${wall.firstText} → ${wall.lastText} over this range, ` +
         `${dir} ${Math.abs(change).toFixed(0)}%.`;
}

/* ---------------------------------------------------------------- probe */
function buildProbe() {
  const canvas = $("#scene");
  const probe = $("#probe");
  const regimeBox = $("#regime-now");
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const local = new THREE.Vector3();

  const hide = () => { probe.hidden = true; regimeBox.hidden = true; };

  canvas.addEventListener("pointerleave", hide);
  canvas.addEventListener("pointermove", (ev) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, stage.camera);

    const hits = raycaster.intersectObject(layers.surface, false);
    if (!hits.length) { hide(); return; }

    local.copy(hits[0].point);
    stage.world.worldToLocal(local);

    const rows = layers.rows;
    const cols = data.cols;
    const col = clamp(Math.round((local.x / BOX.W) * (cols - 1)), 0, cols - 1);
    const rowSlot = clamp(Math.round((local.z / BOX.D) * (rows.length - 1)), 0, rows.length - 1);
    const day = rows[rowSlot];

    const value = data.at(day, col);
    const iso = data.dates[day];
    const reconstructed = col < data.realLow[day] || col > data.realHigh[day];

    probe.innerHTML =
      `<b>${pct(value)}</b> &nbsp;<span class="p-date">at ${maturityLabel(data.maturities[col])}</span>` +
      `<br><span class="p-date">${longDate(iso)}</span>` +
      (reconstructed ? `<span class="p-recon">Reconstructed — not published</span>` : "");
    probe.hidden = false;
    probe.style.left = `${ev.clientX - rect.left}px`;
    probe.style.top = `${ev.clientY - rect.top}px`;

    const regime = data.manifest.regimes.find((r) => iso >= r.start && iso <= r.end);
    if (regime && state.showRegimes) {
      regimeBox.innerHTML = `<b>${regime.name}</b><span>${regime.note}</span>`;
      regimeBox.hidden = false;
    } else {
      regimeBox.hidden = true;
    }
  });
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ---------------------------------------------------------------- error */
function showError(err) {
  console.error(err);
  const box = $("#loading");
  box.innerHTML =
    `<p style="max-width:34rem;text-align:center;line-height:1.6">
       <strong>Could not start.</strong><br>${escapeHtml(err.message)}<br><br>
       <span style="font-size:13px;color:#5a6782">
         If you opened this file directly from your computer, the browser blocks
         it from loading the data. Serve the folder instead, for example by
         running <code>python3 -m http.server</code> in it.
       </span>
     </p>`;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
