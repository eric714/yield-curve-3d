/**
 * The data-driven parts of the scene: the yield surface, the individual daily
 * curves drawn on it, the Fed funds ribbon along the front edge, the context
 * series on the back wall, the QE/QT bands on the floor, the recession
 * shading, the event markers and the date cursor.
 *
 * Buffers are allocated once at their largest size and rewritten in place, so
 * dragging a date slider does not churn through garbage collection.
 */
import * as THREE from "three";
import { BOX } from "./scene.js";
import { ramp, REGIME_COLOURS } from "./colormap.js";
import { monthYear } from "./data.js";
import { pchip } from "./interpolate.js";

// Cap on mesh rows. Longer ranges are sampled down; at 36 years this is about
// one row every two trading days, far finer than a screen pixel.
const MAX_ROWS = 1200;
const TARGET_CURVE_LINES = 72;
const WALL_H = BOX.H * 0.8;

export const HEIGHT_MODES = {
  level:   { label: "Yield", unit: "%", ramp: "sequential",
             note: "The yield itself. The view the surface was built for." },
  vsFunds: { label: "Yield minus Fed funds", unit: "pp", ramp: "diverging",
             note: "How far each maturity sits above or below the overnight "
                 + "policy rate. Under QE the front edge is pinned at zero "
                 + "while everything behind it is dragged down towards it." },
  vs3m:    { label: "Yield minus 3-month", unit: "pp", ramp: "diverging",
             note: "The slope of the curve, measured from the 3-month bill. "
                 + "Anything below the zero plane is an inversion." },
};

const SERIES_STYLE = {
  WALCL:       { colour: 0x4f8fe8, unit: "$tn", scale: 1e-6, decimals: 2, log: false },
  SP500:       { colour: 0xe8c25f, unit: "",    scale: 1,    decimals: 0, log: true },
  NASDAQCOM:   { colour: 0x5ed1a8, unit: "",    scale: 1,    decimals: 0, log: true },
  VIXCLS:      { colour: 0xe07a9a, unit: "",    scale: 1,    decimals: 1, log: false },
  THREEFYTP10: { colour: 0xb392e0, unit: "pp",  scale: 1,    decimals: 2, log: false },
};

/** Every tenor, as index positions. */
export const defaultTenors = (n) => Array.from({ length: n }, (_, i) => i);

export class Layers {
  constructor(stage, data, theme) {
    this.stage = stage;
    this.data = data;
    this.theme = theme;
    this.group = new THREE.Group();
    stage.world.add(this.group);

    const cols = data.cols;
    const maxVerts = MAX_ROWS * cols;

    this.precompute();

    /* ------------------------------------------------------- surface */
    this.surfaceGeo = new THREE.BufferGeometry();
    this.surfacePos = new Float32Array(maxVerts * 3);
    this.surfaceCol = new Float32Array(maxVerts * 3);
    this.surfaceGeo.setAttribute("position", new THREE.BufferAttribute(this.surfacePos, 3));
    this.surfaceGeo.setAttribute("color", new THREE.BufferAttribute(this.surfaceCol, 3));
    this.surfaceGeo.setIndex(new THREE.BufferAttribute(
      new Uint32Array((MAX_ROWS - 1) * (cols - 1) * 6), 1));
    this.surface = new THREE.Mesh(
      this.surfaceGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    this.group.add(this.surface);

    /* --------------------------------------------------- daily curves */
    this.lineGeo = new THREE.BufferGeometry();
    this.linePos = new Float32Array(TARGET_CURVE_LINES * 2 * cols * 3);
    this.lineCol = new Float32Array(TARGET_CURVE_LINES * 2 * cols * 3);
    this.lineGeo.setAttribute("position", new THREE.BufferAttribute(this.linePos, 3));
    this.lineGeo.setAttribute("color", new THREE.BufferAttribute(this.lineCol, 3));
    this.curves = new THREE.LineSegments(
      this.lineGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })
    );
    this.group.add(this.curves);

    /* ------------------------------------------------- fed funds band */
    this.ffGeo = this.stripGeometry(MAX_ROWS);
    this.ffPos = this.ffGeo.attributes.position.array;
    this.fedFunds = new THREE.Mesh(this.ffGeo, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.ffLineGeo = new THREE.BufferGeometry();
    this.ffLinePos = new Float32Array(MAX_ROWS * 3);
    this.ffLineGeo.setAttribute("position", new THREE.BufferAttribute(this.ffLinePos, 3));
    this.fedFundsEdge = new THREE.Line(this.ffLineGeo, new THREE.LineBasicMaterial({}));
    this.group.add(this.fedFunds, this.fedFundsEdge);

    /* ------------------------------------------------- back wall area */
    this.wallGeo = this.stripGeometry(MAX_ROWS);
    this.wallPos = this.wallGeo.attributes.position.array;
    this.wallCol = new Float32Array(MAX_ROWS * 2 * 3);
    this.wallGeo.setAttribute("color", new THREE.BufferAttribute(this.wallCol, 3));
    this.wall = new THREE.Mesh(this.wallGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.34,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    this.wallLineGeo = new THREE.BufferGeometry();
    this.wallLinePos = new Float32Array(MAX_ROWS * 3);
    this.wallLineGeo.setAttribute("position", new THREE.BufferAttribute(this.wallLinePos, 3));
    this.wallEdge = new THREE.Line(this.wallLineGeo, new THREE.LineBasicMaterial({}));
    this.group.add(this.wall, this.wallEdge);

    /* ------------------------- floors: QE bands, recessions, events --- */
    this.regimes = new THREE.Group();
    this.recessions = new THREE.Group();
    this.events = new THREE.Group();
    this.group.add(this.regimes, this.recessions, this.events);

    /* ------------------------------------------------------- cursor -- */
    this.cursorGeo = new THREE.BufferGeometry();
    this.cursorPos = new Float32Array(cols * 3);
    this.cursorGeo.setAttribute("position", new THREE.BufferAttribute(this.cursorPos, 3));
    this.cursorCurve = new THREE.Line(this.cursorGeo, new THREE.LineBasicMaterial({
      transparent: true, opacity: 0.95, depthTest: false,
    }));
    this.cursorCurve.renderOrder = 5;
    this.cursorFloorGeo = new THREE.BufferGeometry();
    this.cursorFloorPos = new Float32Array(2 * 3);
    this.cursorFloorGeo.setAttribute("position",
      new THREE.BufferAttribute(this.cursorFloorPos, 3));
    this.cursorFloor = new THREE.Line(this.cursorFloorGeo, new THREE.LineBasicMaterial({
      transparent: true, opacity: 0.5,
    }));
    this.cursorCurve.visible = this.cursorFloor.visible = false;
    this.group.add(this.cursorCurve, this.cursorFloor);

    // The surface is resampled every rebuild, either copied straight from the
    // prebuilt grid or re-interpolated through whichever maturities the reader
    // has left switched on.
    this.gridM = new Float64Array(cols);
    this.gridX = new Float64Array(cols);
    this.sampled = new Float32Array(maxVerts);
    this.filled = new Uint8Array(maxVerts);
    this.knotX = new Float64Array(32);
    this.knotY = new Float64Array(32);
    this.knotReal = new Uint8Array(32);
    this.rowOut = new Float64Array(cols);
    this.warp = data.manifest.warp || 0.32;
    this.buildGrid(null);

    this.rows = [];
    this.setTheme(theme);
  }

  stripGeometry(maxRows) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position",
      new THREE.BufferAttribute(new Float32Array(maxRows * 2 * 3), 3));
    const idx = new Uint32Array((maxRows - 1) * 6);
    for (let r = 0, k = 0; r < maxRows - 1; r++) {
      const a = r * 2;
      idx[k++] = a; idx[k++] = a + 2; idx[k++] = a + 1;
      idx[k++] = a + 1; idx[k++] = a + 2; idx[k++] = a + 3;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    return geo;
  }

  setTheme(theme) {
    this.theme = theme;
    this.fedFunds.material.color.setHex(theme.fedFunds);
    this.fedFundsEdge.material.color.setHex(theme.fedFundsEdge);
    this.cursorCurve.material.color.setHex(theme.cursor);
    this.cursorFloor.material.color.setHex(theme.cursor);
  }

  /**
   * Per-day series the height modes and the recession shading need, worked out
   * once rather than on every slider move.
   */
  precompute() {
    const { rows, cols, dates, context, maturities, manifest } = this.data;

    this.col3m = maturities.reduce(
      (best, m, i) => (Math.abs(m - 0.25) < Math.abs(maturities[best] - 0.25) ? i : best), 0);

    this.fundsMid = new Float32Array(rows);
    for (let i = 0; i < rows; i++) {
      const hi = context.fedFundsUpper[i], lo = context.fedFundsLower[i];
      this.fundsMid[i] = hi == null ? 0 : (hi + (lo == null ? hi : lo)) / 2;
    }

    this.threeMonth = new Float32Array(rows);
    for (let i = 0; i < rows; i++) this.threeMonth[i] = this.data.tenorAt(i, 0.25);

    this.inRecession = new Uint8Array(rows);
    for (const span of manifest.recessions || []) {
      const a = this.data.indexOf(span.start);
      const b = this.data.indexOf(span.end);
      for (let i = a; i <= b && i < rows; i++) this.inRecession[i] = 1;
    }
    void dates; void cols;
  }

  /**
   * Lay out the maturity axis for a set of selected tenors.
   *
   * Evenly spaced in maturity raised to the same power the pipeline used, so
   * the short end keeps its room. Passing null restores the full axis.
   */
  buildGrid(selected) {
    const { manifest } = this.data;
    const years = manifest.tenorYears;
    const n = this.gridM.length;
    const lo = selected ? years[selected[0]] : years[0];
    const hi = selected ? years[selected[selected.length - 1]] : years[years.length - 1];
    const a = lo ** this.warp, b = hi ** this.warp;
    for (let i = 0; i < n; i++) {
      const x = a + ((b - a) * i) / (n - 1);
      this.gridX[i] = x;
      this.gridM[i] = x ** (1 / this.warp);
    }
  }

  /**
   * Fill `sampled` with the yield at every grid point for every drawn row, and
   * `filled` with whether that point rests on reconstructed data.
   *
   * With every maturity switched on this is a straight copy of the prebuilt
   * grid, which already carries the pipeline's short-end anchoring. With a
   * subset it re-interpolates through the chosen maturities only, so the
   * surface stays continuous instead of developing holes.
   */
  resample(rows, selected) {
    const data = this.data;
    const cols = data.cols;
    const nRows = rows.length;
    const all = selected.length === data.tenorCount;

    if (all) {
      this.buildGrid(null);
      for (let r = 0; r < nRows; r++) {
        const day = rows[r];
        const src = day * cols, dst = r * cols;
        const lo = data.realLow[day], hi = data.realHigh[day];
        for (let c = 0; c < cols; c++) {
          this.sampled[dst + c] = data.yields[src + c];
          this.filled[dst + c] = c < lo || c > hi ? 1 : 0;
        }
      }
      return;
    }

    this.buildGrid(selected);
    const years = data.manifest.tenorYears;
    const k = selected.length;
    for (let i = 0; i < k; i++) this.knotX[i] = years[selected[i]] ** this.warp;

    for (let r = 0; r < nRows; r++) {
      const day = rows[r];
      const curve = data.tenorRow(day);
      const mask = data.publishedMask(day);
      for (let i = 0; i < k; i++) {
        this.knotY[i] = curve[selected[i]];
        this.knotReal[i] = (mask >> selected[i]) & 1;
      }
      pchip(this.knotX, this.knotY, k, this.gridX, this.rowOut);

      const dst = r * cols;
      for (let c = 0; c < cols; c++) {
        this.sampled[dst + c] = this.rowOut[c];
        // A point is reconstructed if either knot it sits between was filled
        // in rather than published.
        const x = this.gridX[c];
        let j = 0;
        while (j < k - 2 && this.knotX[j + 1] < x) j++;
        this.filled[dst + c] =
          this.knotReal[j] && this.knotReal[Math.min(j + 1, k - 1)] ? 0 : 1;
      }
    }
  }

  /** Apply the current height mode to a raw yield. */
  offsetFor(mode, day) {
    if (mode === "vsFunds") return this.fundsMid[day];
    if (mode === "vs3m") return this.threeMonth[day];
    return 0;
  }

  /**
   * Rebuild every layer for the given date range.
   * Returns a summary the UI uses for the legend and the captions.
   */
  update(state) {
    const { from, to, heightMode } = state;
    const data = this.data;
    const cols = data.cols;
    const mode = HEIGHT_MODES[heightMode] ? heightMode : "level";

    const count = to - from + 1;
    const step = Math.max(1, Math.ceil(count / MAX_ROWS));
    const rows = [];
    for (let i = from; i <= to; i += step) rows.push(i);
    if (rows[rows.length - 1] !== to) rows.push(to);
    this.rows = rows;
    this.mode = mode;

    const selected = state.tenors && state.tenors.length >= 2
      ? state.tenors : defaultTenors(data.tenorCount);
    this.resample(rows, selected);

    // Extent of the transformed values across what is actually drawn.
    let lo = Infinity, hi = -Infinity;
    for (let r = 0; r < rows.length; r++) {
      const shift = this.offsetFor(mode, rows[r]);
      const base = r * cols;
      for (let c = 0; c < cols; c++) {
        const v = this.sampled[base + c] - shift;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    this.stage.setValueRange(lo, hi);
    this.colourAbs = Math.max(Math.abs(lo), Math.abs(hi), 0.25);
    this.colourMax = Math.max(hi, 0.25);

    this.buildSurface(rows, cols, state, mode);
    this.buildCurves(rows, cols, state, mode);
    const ff = this.buildFedFunds(rows, state, mode);
    const wall = this.buildWall(rows, state);
    const regimeLabels = this.buildRegimes(rows, state);
    this.buildRecessions(rows, state);
    const events = this.buildEvents(rows, state);

    return {
      rows, mode, wall, ff, regimeLabels, events,
      grid: this.gridM,
      maturityTicks: this.maturityTicks(selected),
      selected,
      anyFilled: this.anyFilled,
      valueMin: this.stage.valueMin,
      valueMax: this.stage.valueMax,
      colourAbs: this.colourAbs,
      colourMax: this.colourMax,
      dataMin: lo, dataMax: hi,
    };
  }

  /** Colour for a transformed value, respecting the mode's ramp. */
  colourFor(v, out) {
    if (this.mode === "level") ramp(v / this.colourMax, out, "sequential");
    else ramp(0.5 + (0.5 * v) / this.colourAbs, out, "diverging");
    const lift = this.theme.surfaceLift;
    if (lift) {
      out[0] += (1 - out[0]) * lift;
      out[1] += (1 - out[1]) * lift;
      out[2] += (1 - out[2]) * lift;
    }
    return out;
  }

  /* ------------------------------------------------------------ surface */
  buildSurface(rows, cols, state, mode) {
    const { data, stage, theme } = this;
    const pos = this.surfacePos, col = this.surfaceCol;
    const nRows = rows.length;
    const rgb = [0, 0, 0];
    const shade = theme.shadow;
    let anyFilled = false;
    let p = 0;

    for (let r = 0; r < nRows; r++) {
      const day = rows[r];
      const z = stage.z(r, nRows);
      const base = r * cols;
      const shift = this.offsetFor(mode, day);
      const shaded = state.showRecessions && this.inRecession[day];

      for (let c = 0; c < cols; c++) {
        const v = this.sampled[base + c] - shift;
        pos[p]     = stage.x(c, cols);
        pos[p + 1] = stage.y(v);
        pos[p + 2] = z;

        this.colourFor(v, rgb);
        let r0 = rgb[0], g0 = rgb[1], b0 = rgb[2];

        if (this.filled[base + c]) {
          anyFilled = true;
          // Reconstructed: pull towards a desaturated, dimmer version of
          // itself so it still reads as part of the surface but is visibly
          // not measured data.
          const lum = r0 * 0.3 + g0 * 0.59 + b0 * 0.11;
          const grey = lum * 0.72;
          r0 = r0 * 0.35 + grey * 0.65;
          g0 = g0 * 0.35 + grey * 0.65;
          b0 = b0 * 0.35 + grey * 0.65;
        }
        if (shaded) {
          // Recessions dim the surface rather than colouring it, so they use a
          // channel the QE bands do not and the two can be read at once.
          const k = shade.amount;
          r0 = r0 * (1 - k) + shade.tint[0] * k;
          g0 = g0 * (1 - k) + shade.tint[1] * k;
          b0 = b0 * (1 - k) + shade.tint[2] * k;
        }
        col[p] = r0; col[p + 1] = g0; col[p + 2] = b0;
        p += 3;
      }
    }

    if (this.indexRows !== nRows) {
      const idx = this.surfaceGeo.index.array;
      let k = 0;
      for (let r = 0; r < nRows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
          idx[k++] = a; idx[k++] = d; idx[k++] = b;
          idx[k++] = b; idx[k++] = d; idx[k++] = e;
        }
      }
      this.surfaceGeo.index.needsUpdate = true;
      this.indexRows = nRows;
    }

    this.surfaceGeo.attributes.position.needsUpdate = true;
    this.surfaceGeo.attributes.color.needsUpdate = true;
    this.surfaceGeo.setDrawRange(0, (nRows - 1) * (cols - 1) * 6);
    this.surfaceGeo.computeVertexNormals();
    this.surfaceGeo.computeBoundingSphere();
    this.anyFilled = anyFilled;
  }

  /* ------------------------------------------------------ daily curves */
  buildCurves(rows, cols, state, mode) {
    this.curves.visible = state.showLines;
    if (!state.showLines) return;

    const { data, stage, theme } = this;
    const nRows = rows.length;
    const stride = Math.max(1, Math.round(nRows / TARGET_CURVE_LINES));
    const pos = this.linePos, col = this.lineCol;
    const rgb = [0, 0, 0];
    const dim = theme.curveLine;
    let p = 0;

    outer:
    for (let r = 0; r < nRows; r += stride) {
      const day = rows[r];
      const z = stage.z(r, nRows) + 0.05;
      const base = r * cols;
      const shift = this.offsetFor(mode, day);
      for (let c = 0; c < cols - 1; c++) {
        for (const cc of [c, c + 1]) {
          const v = this.sampled[base + cc] - shift;
          pos[p]     = stage.x(cc, cols);
          pos[p + 1] = stage.y(v) + 0.25;   // lift clear of the surface
          pos[p + 2] = z;
          this.colourFor(v, rgb);
          col[p] = rgb[0] * dim; col[p + 1] = rgb[1] * dim; col[p + 2] = rgb[2] * dim;
          p += 3;
          if (p >= pos.length) break outer;
        }
      }
    }

    this.lineGeo.setDrawRange(0, p / 3);
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineGeo.attributes.color.needsUpdate = true;
    this.lineGeo.computeBoundingSphere();
  }

  /* --------------------------------------------------- fed funds band */
  buildFedFunds(rows, state, mode) {
    const on = state.showFedFunds;
    this.fedFunds.visible = on;
    this.fedFundsEdge.visible = on;
    if (!on) return null;

    const { context } = this.data;
    const stage = this.stage;
    const pos = this.ffPos, line = this.ffLinePos;
    const nRows = rows.length;
    let p = 0, l = 0, latest = null;

    for (let r = 0; r < nRows; r++) {
      const day = rows[r];
      const z = stage.z(r, nRows);
      const shift = this.offsetFor(mode, day);
      const hi = context.fedFundsUpper[day], lo = context.fedFundsLower[day];
      const yHi = stage.y((hi == null ? 0 : hi) - shift);
      const yLo = stage.y((lo == null ? hi == null ? 0 : hi : lo) - shift);
      // Before December 2008 the target was a single number, not a range.
      // Give it a little thickness so it does not vanish edge-on.
      const top = Math.max(yHi, yLo + 0.45);

      pos[p] = BOX.FF_X; pos[p + 1] = yLo; pos[p + 2] = z; p += 3;
      pos[p] = BOX.FF_X; pos[p + 1] = top; pos[p + 2] = z; p += 3;
      line[l] = BOX.FF_X; line[l + 1] = top + 0.05; line[l + 2] = z; l += 3;
      if (hi != null) latest = hi;
    }

    this.ffGeo.setDrawRange(0, (nRows - 1) * 6);
    this.ffGeo.attributes.position.needsUpdate = true;
    this.ffGeo.computeBoundingSphere();
    this.ffLineGeo.setDrawRange(0, l / 3);
    this.ffLineGeo.attributes.position.needsUpdate = true;
    this.ffLineGeo.computeBoundingSphere();
    return { latest };
  }

  /* ------------------------------------------------------- back wall */
  buildWall(rows, state) {
    const id = state.contextSeries;
    const series = id === "none" ? null : this.data.context.series[id];
    const on = !!series;
    this.wall.visible = on;
    this.wallEdge.visible = on;
    if (!on) return null;

    const style = SERIES_STYLE[id] || SERIES_STYLE.WALCL;
    const base = new THREE.Color(style.colour);
    this.wallEdge.material.color.copy(base).offsetHSL(0, 0, 0.2);

    const values = series.values;
    const stage = this.stage;
    const nRows = rows.length;

    let max = -Infinity, min = Infinity, first = null, last = null;
    for (const day of rows) {
      const v = values[day];
      if (v == null || (style.log && v <= 0)) continue;
      if (v > max) max = v;
      if (v < min) min = v;
      if (first === null) first = v;
      last = v;
    }
    if (!isFinite(max)) {
      this.wall.visible = this.wallEdge.visible = false;
      return null;
    }

    // Equity indices span more than an order of magnitude over 36 years, so a
    // linear wall would flatten the whole of the 1990s into the baseline.
    const project = style.log
      ? (v) => (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min) || 1)
      : (v) => (v - Math.min(0, min)) / ((max - Math.min(0, min)) || 1);
    const zeroLevel = style.log ? 0 : project(0);

    const pos = this.wallPos, line = this.wallLinePos, col = this.wallCol;
    const shade = this.theme.shadow;
    let p = 0, l = 0, c = 0;

    for (let r = 0; r < nRows; r++) {
      const day = rows[r];
      const v = values[day];
      const z = stage.z(r, nRows);
      const h = v == null ? zeroLevel * WALL_H : project(v) * WALL_H;
      const y0 = zeroLevel * WALL_H;

      pos[p] = BOX.WALL_X; pos[p + 1] = y0; pos[p + 2] = z; p += 3;
      pos[p] = BOX.WALL_X; pos[p + 1] = h;  pos[p + 2] = z; p += 3;
      line[l] = BOX.WALL_X; line[l + 1] = h + 0.05; line[l + 2] = z; l += 3;

      // The wall goes into shade during recessions too, so a falling index and
      // the recession that goes with it are visible in one glance.
      let cr = base.r, cg = base.g, cb = base.b;
      if (state.showRecessions && this.inRecession[day]) {
        const k = shade.amount;
        cr = cr * (1 - k) + shade.tint[0] * k;
        cg = cg * (1 - k) + shade.tint[1] * k;
        cb = cb * (1 - k) + shade.tint[2] * k;
      }
      col[c] = cr; col[c + 1] = cg; col[c + 2] = cb; c += 3;
      col[c] = cr; col[c + 1] = cg; col[c + 2] = cb; c += 3;
    }

    this.wallGeo.setDrawRange(0, (nRows - 1) * 6);
    this.wallGeo.attributes.position.needsUpdate = true;
    this.wallGeo.attributes.color.needsUpdate = true;
    this.wallGeo.computeBoundingSphere();
    this.wallLineGeo.setDrawRange(0, l / 3);
    this.wallLineGeo.attributes.position.needsUpdate = true;
    this.wallLineGeo.computeBoundingSphere();

    const fmt = (v) => v == null ? "—" :
      (v * style.scale).toLocaleString("en-US", {
        minimumFractionDigits: style.decimals,
        maximumFractionDigits: style.decimals,
      }) + (style.unit ? ` ${style.unit}` : "");

    return {
      id, label: series.label, max, min, first, last, style,
      format: fmt,
      maxText: fmt(max), lastText: fmt(last), firstText: fmt(first),
      changePct: first ? ((last - first) / first) * 100 : null,
      wallTop: WALL_H,
    };
  }

  /* --------------------------------------------- floor: dates helper */
  zFinder(rows) {
    const dates = this.data.dates;
    const nRows = rows.length;
    const firstISO = dates[rows[0]], lastISO = dates[rows[nRows - 1]];
    return (iso) => {
      if (iso <= firstISO) return 0;
      if (iso >= lastISO) return BOX.D;
      let lo = 0, hi = nRows - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dates[rows[mid]] < iso) lo = mid + 1; else hi = mid;
      }
      return this.stage.z(lo, nRows);
    };
  }

  /* -------------------------------------------------------- QE bands */
  buildRegimes(rows, state) {
    this.regimes.clear();
    if (!state.showRegimes) return [];

    const { dates, manifest } = this.data;
    const zFor = this.zFinder(rows);
    const firstISO = dates[rows[0]], lastISO = dates[rows[rows.length - 1]];
    const floor = this.stage.y(this.stage.valueMin);

    const verts = [], colours = [], labels = [], marks = [];
    const c = new THREE.Color();

    for (const reg of manifest.regimes) {
      if (reg.end < firstISO || reg.start > lastISO) continue;
      const z0 = zFor(reg.start), z1 = zFor(reg.end);
      if (z1 - z0 < 0.4) continue;

      c.setHex(REGIME_COLOURS[reg.kind] || 0x888888);
      const x0 = BOX.FF_X - 3, x1 = BOX.WALL_X + 3, y = floor + 0.18;
      const quad = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        verts.push(quad[i][0], quad[i][1], quad[i][2]);
        colours.push(c.r, c.g, c.b);
      }
      if (reg.start >= firstISO) marks.push([x0, floor + 0.3, z0, x1, floor + 0.3, z0, c.getHex()]);
      labels.push({ p: [x1 + 5, floor + 1.5, (z0 + z1) / 2], text: reg.name, cls: "era" });
    }

    if (verts.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
      this.regimes.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.2,
        side: THREE.DoubleSide, depthWrite: false,
      })));
    }
    for (const m of marks) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(m.slice(0, 6), 3));
      this.regimes.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: m[6], transparent: true, opacity: 0.7,
      })));
    }
    return labels;
  }

  /* ----------------------------------------------------- recessions */
  /**
   * The shading on the surface is the main signal. This adds a narrow rail in
   * its own lane past the back wall, so exact start and end dates can still be
   * read off without crowding the QE bands.
   */
  buildRecessions(rows, state) {
    this.recessions.clear();
    if (!state.showRecessions) return;

    const { dates, manifest } = this.data;
    const zFor = this.zFinder(rows);
    const firstISO = dates[rows[0]], lastISO = dates[rows[rows.length - 1]];
    const floor = this.stage.y(this.stage.valueMin);
    const verts = [];

    for (const span of manifest.recessions || []) {
      if (span.end < firstISO || span.start > lastISO) continue;
      const z0 = zFor(span.start), z1 = zFor(span.end);
      if (z1 - z0 < 0.3) continue;
      const quad = [
        [BOX.RAIL_X0, floor + 0.22, z0], [BOX.RAIL_X1, floor + 0.22, z0],
        [BOX.RAIL_X1, floor + 0.22, z1], [BOX.RAIL_X0, floor + 0.22, z1],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) verts.push(...quad[i]);
    }
    if (!verts.length) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    this.recessions.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: this.theme.recessionRail, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false,
    })));
  }

  /* --------------------------------------------------------- events */
  /**
   * Markers only, never text. A small diamond in the margin says "something
   * happened here"; the words appear in the readout when the date cursor
   * reaches it, and in the sidebar list. That keeps a 36-year view from
   * turning into a wall of annotations.
   */
  buildEvents(rows, state) {
    this.events.clear();
    const { dates, manifest } = this.data;
    const list = (manifest.events || []).filter(
      (e) => e.date >= dates[rows[0]] && e.date <= dates[rows[rows.length - 1]]);
    if (!state.showEvents || !list.length) return list;

    const zFor = this.zFinder(rows);
    const floor = this.stage.y(this.stage.valueMin);
    const verts = [];
    const x = BOX.FF_X - 5;

    // Zoomed out to decades, several events can land on the same pixel. Merge
    // markers that would overlap into one slightly larger diamond rather than
    // stacking them into an indistinct blob; the sidebar still lists each one.
    const placed = list.map((ev) => ({ z: zFor(ev.date), n: 1 }))
      .sort((a, b) => a.z - b.z)
      .reduce((groups, mark) => {
        const last = groups[groups.length - 1];
        if (last && mark.z - last.z < 3.4) { last.n++; return groups; }
        groups.push(mark);
        return groups;
      }, []);

    for (const mark of placed) {
      const s = mark.n > 1 ? 2.6 : 1.9;
      const diamond = [[x, floor + 0.4, mark.z - s], [x + s, floor + 0.4, mark.z],
                       [x, floor + 0.4, mark.z + s], [x - s, floor + 0.4, mark.z]];
      for (const i of [0, 1, 2, 0, 2, 3]) verts.push(...diamond[i]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    this.events.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: this.theme.eventMark, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false,
    })));
    return list;
  }

  /* --------------------------------------------------------- cursor */
  /** Highlight the whole curve for one date, or clear it with null. */
  setCursor(day) {
    const show = day != null && this.rows.length > 0;
    this.cursorCurve.visible = show;
    this.cursorFloor.visible = show;
    if (!show) return;

    const { data, stage } = this;
    const cols = data.cols;
    const nRows = this.rows.length;
    // Snap to the nearest drawn row so the highlight sits on the mesh.
    let slot = 0, best = Infinity;
    for (let i = 0; i < nRows; i++) {
      const d = Math.abs(this.rows[i] - day);
      if (d < best) { best = d; slot = i; }
    }
    const z = stage.z(slot, nRows);
    const shift = this.offsetFor(this.mode, day);
    const base = slot * cols;
    for (let c = 0; c < cols; c++) {
      this.cursorPos[c * 3] = stage.x(c, cols);
      this.cursorPos[c * 3 + 1] = stage.y(this.sampled[base + c] - shift) + 0.5;
      this.cursorPos[c * 3 + 2] = z;
    }
    this.cursorGeo.attributes.position.needsUpdate = true;
    this.cursorGeo.computeBoundingSphere();

    const floor = stage.y(stage.valueMin) + 0.5;
    this.cursorFloorPos.set([BOX.FF_X - 7, floor, z, BOX.RAIL_X1 + 1, floor, z]);
    this.cursorFloorGeo.attributes.position.needsUpdate = true;
    this.cursorFloorGeo.computeBoundingSphere();
  }

  /**
   * Maturities to label on the axis. The standard set, narrowed to whatever
   * the grid currently spans; if that leaves too few, fall back to the chosen
   * maturities themselves so the axis is never bare.
   */
  maturityTicks(selected) {
    const STANDARD = [1 / 12, 0.25, 0.5, 1, 2, 5, 10, 20, 30];
    const lo = this.gridM[0], hi = this.gridM[this.gridM.length - 1];
    const inRange = STANDARD.filter((m) => m >= lo - 1e-6 && m <= hi + 1e-6);
    if (inRange.length >= 4) return inRange;

    const years = this.data.manifest.tenorYears;
    const chosen = selected.map((i) => years[i]);
    if (chosen.length <= 8) return chosen;
    const stride = Math.ceil(chosen.length / 8);
    return chosen.filter((_, i) => i % stride === 0 || i === chosen.length - 1);
  }

  /** Year or month gridline positions for the current range. */
  timeMarks(rows) {
    const dates = this.data.dates;
    const nRows = rows.length;
    const firstYear = +dates[rows[0]].slice(0, 4);
    const lastYear = +dates[rows[nRows - 1]].slice(0, 4);
    const span = lastYear - firstYear;
    const every = span > 24 ? 5 : span > 12 ? 2 : 1;

    const marks = [];
    let prev = null;
    for (let r = 0; r < nRows; r++) {
      const iso = dates[rows[r]];
      const year = +iso.slice(0, 4);
      const month = +iso.slice(5, 7);
      if (span >= 2) {
        if (year !== prev && year % every === 0) {
          marks.push({ z: this.stage.z(r, nRows), label: String(year) });
          prev = year;
        }
      } else {
        const key = `${year}-${month}`;
        const stepMonths = span >= 1 ? 3 : 1;
        if (key !== prev && (month - 1) % stepMonths === 0) {
          marks.push({ z: this.stage.z(r, nRows), label: monthYear(iso) });
          prev = key;
        }
      }
    }
    return marks;
  }
}
