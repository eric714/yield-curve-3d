/**
 * The data-driven parts of the scene: the yield surface itself, the individual
 * daily curves drawn on top of it, the Fed funds ribbon along the front edge,
 * the context series on the back wall, and the QE/QT bands on the floor.
 *
 * Buffers are allocated once at their largest size and rewritten in place, so
 * dragging a date slider does not churn through garbage collection.
 */
import * as THREE from "three";
import { BOX } from "./scene.js";
import { ramp, REGIME_COLOURS } from "./colormap.js";
import { monthYear } from "./data.js";

// Cap on mesh rows. Longer ranges are sampled down; at 36 years this is about
// one row every two trading days, far finer than a screen pixel.
const MAX_ROWS = 1200;
const TARGET_CURVE_LINES = 72;

const FF_X = -8;           // Fed funds ribbon sits just in front of 1-month
const WALL_X = BOX.W + 10; // context series sits just beyond 30-year
const WALL_H = BOX.H * 0.8;

const SERIES_STYLE = {
  WALCL:     { colour: 0x4f8fe8, unit: "$tn", scale: 1e-6, decimals: 2 },
  NASDAQCOM: { colour: 0x5ed1a8, unit: "",    scale: 1,    decimals: 0 },
  VIXCLS:    { colour: 0xe07a9a, unit: "",    scale: 1,    decimals: 1 },
  SP500:     { colour: 0xe8c25f, unit: "",    scale: 1,    decimals: 0 },
};

export class Layers {
  constructor(stage, data) {
    this.stage = stage;
    this.data = data;
    this.group = new THREE.Group();
    stage.world.add(this.group);

    const cols = data.cols;
    const maxVerts = MAX_ROWS * cols;

    /* ------------------------------------------------------- surface */
    this.surfaceGeo = new THREE.BufferGeometry();
    this.surfacePos = new Float32Array(maxVerts * 3);
    this.surfaceCol = new Float32Array(maxVerts * 3);
    this.surfaceGeo.setAttribute("position", new THREE.BufferAttribute(this.surfacePos, 3));
    this.surfaceGeo.setAttribute("color", new THREE.BufferAttribute(this.surfaceCol, 3));
    this.surfaceGeo.setIndex(new THREE.BufferAttribute(new Uint32Array((MAX_ROWS - 1) * (cols - 1) * 6), 1));
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
    this.ffGeo = new THREE.BufferGeometry();
    this.ffPos = new Float32Array(MAX_ROWS * 2 * 3);
    this.ffGeo.setAttribute("position", new THREE.BufferAttribute(this.ffPos, 3));
    this.ffGeo.setIndex(new THREE.BufferAttribute(new Uint32Array((MAX_ROWS - 1) * 6), 1));
    this.fedFunds = new THREE.Mesh(
      this.ffGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf2a03c, transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.ffLineGeo = new THREE.BufferGeometry();
    this.ffLinePos = new Float32Array(MAX_ROWS * 3);
    this.ffLineGeo.setAttribute("position", new THREE.BufferAttribute(this.ffLinePos, 3));
    this.fedFundsEdge = new THREE.Line(
      this.ffLineGeo, new THREE.LineBasicMaterial({ color: 0xffc472 })
    );
    this.group.add(this.fedFunds, this.fedFundsEdge);

    /* ------------------------------------------------- back wall area */
    this.wallGeo = new THREE.BufferGeometry();
    this.wallPos = new Float32Array(MAX_ROWS * 2 * 3);
    this.wallGeo.setAttribute("position", new THREE.BufferAttribute(this.wallPos, 3));
    this.wallGeo.setIndex(new THREE.BufferAttribute(new Uint32Array((MAX_ROWS - 1) * 6), 1));
    this.wall = new THREE.Mesh(
      this.wallGeo,
      new THREE.MeshBasicMaterial({
        color: 0x4f8fe8, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.wallLineGeo = new THREE.BufferGeometry();
    this.wallLinePos = new Float32Array(MAX_ROWS * 3);
    this.wallLineGeo.setAttribute("position", new THREE.BufferAttribute(this.wallLinePos, 3));
    this.wallEdge = new THREE.Line(
      this.wallLineGeo, new THREE.LineBasicMaterial({ color: 0x8fc4ff })
    );
    this.group.add(this.wall, this.wallEdge);

    /* ----------------------------------------------------- QE/QT bands */
    this.regimes = new THREE.Group();
    this.group.add(this.regimes);

    this.rows = [];        // dataset row index for each mesh row
    this.colourMax = 8;
  }

  /**
   * Rebuild every layer for the given date range.
   * Returns a summary the UI uses for the legend and the wall caption.
   */
  update(state) {
    const { from, to } = state;
    const data = this.data;
    const cols = data.cols;

    const count = to - from + 1;
    const step = Math.max(1, Math.ceil(count / MAX_ROWS));
    const rows = [];
    for (let i = from; i <= to; i += step) rows.push(i);
    if (rows[rows.length - 1] !== to) rows.push(to);
    this.rows = rows;

    const [, dataMax] = data.extent(from, to);
    const yieldMax = this.stage.setYieldMax(dataMax);
    this.colourMax = yieldMax;

    this.buildSurface(rows, cols, state);
    this.buildCurves(rows, cols, state);
    const ff = this.buildFedFunds(rows, state);
    const wall = this.buildWall(rows, state);
    const regimeLabels = this.buildRegimes(rows, state);

    return { yieldMax, colourMax: this.colourMax, wall, ff, regimeLabels, rows };
  }

  /* ------------------------------------------------------------ surface */
  buildSurface(rows, cols, state) {
    const { data, stage } = this;
    const pos = this.surfacePos, col = this.surfaceCol;
    const nRows = rows.length;
    const rgb = [0, 0, 0];
    let p = 0;

    for (let r = 0; r < nRows; r++) {
      const day = rows[r];
      const z = stage.z(r, nRows);
      const lo = data.realLow[day], hi = data.realHigh[day];
      const base = day * cols;

      for (let c = 0; c < cols; c++) {
        const v = data.yields[base + c];
        pos[p]     = stage.x(c, cols);
        pos[p + 1] = stage.y(v);
        pos[p + 2] = z;

        ramp(v / this.colourMax, rgb);
        if (state.showRecon && (c < lo || c > hi)) {
          // Reconstructed: pull towards a desaturated, dimmer version of
          // itself so it still reads as part of the surface but is visibly
          // not measured data.
          const lum = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11;
          const grey = lum * 0.72;
          col[p]     = rgb[0] * 0.35 + grey * 0.65;
          col[p + 1] = rgb[1] * 0.35 + grey * 0.65;
          col[p + 2] = rgb[2] * 0.35 + grey * 0.65;
        } else {
          col[p] = rgb[0]; col[p + 1] = rgb[1]; col[p + 2] = rgb[2];
        }
        p += 3;
      }
    }

    // Triangle indices, rebuilt only when the row count changes.
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
      this.surfaceGeo.setDrawRange(0, (nRows - 1) * (cols - 1) * 6);
      this.surfaceGeo.index.needsUpdate = true;
      this.indexRows = nRows;
    }

    this.surfaceGeo.attributes.position.needsUpdate = true;
    this.surfaceGeo.attributes.color.needsUpdate = true;
    this.surfaceGeo.setDrawRange(0, (nRows - 1) * (cols - 1) * 6);
    this.surfaceGeo.computeVertexNormals();
    this.surfaceGeo.computeBoundingSphere();
  }

  /* ------------------------------------------------------ daily curves */
  buildCurves(rows, cols, state) {
    this.curves.visible = state.showLines;
    if (!state.showLines) return;

    const { data, stage } = this;
    const nRows = rows.length;
    const stride = Math.max(1, Math.round(nRows / TARGET_CURVE_LINES));
    const pos = this.linePos, col = this.lineCol;
    const rgb = [0, 0, 0];
    let p = 0;

    for (let r = 0; r < nRows; r += stride) {
      const day = rows[r];
      const z = stage.z(r, nRows) + 0.05;
      const base = day * cols;
      for (let c = 0; c < cols - 1; c++) {
        for (const cc of [c, c + 1]) {
          const v = data.yields[base + cc];
          pos[p]     = stage.x(cc, cols);
          pos[p + 1] = stage.y(v) + 0.25;   // lift clear of the surface
          pos[p + 2] = z;
          ramp(v / this.colourMax, rgb);
          col[p] = rgb[0] * 0.28; col[p + 1] = rgb[1] * 0.28; col[p + 2] = rgb[2] * 0.28;
          p += 3;
          if (p >= pos.length) break;
        }
        if (p >= pos.length) break;
      }
      if (p >= pos.length) break;
    }

    this.lineGeo.setDrawRange(0, p / 3);
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineGeo.attributes.color.needsUpdate = true;
    this.lineGeo.computeBoundingSphere();
  }

  /* --------------------------------------------------- fed funds band */
  buildFedFunds(rows, state) {
    const on = state.showFedFunds;
    this.fedFunds.visible = on;
    this.fedFundsEdge.visible = on;
    if (!on) return null;

    const { context } = this.data;
    const stage = this.stage;
    const upper = context.fedFundsUpper, lower = context.fedFundsLower;
    const pos = this.ffPos, line = this.ffLinePos;
    const nRows = rows.length;
    let p = 0, l = 0, latest = null;

    for (let r = 0; r < nRows; r++) {
      const day = rows[r];
      const z = stage.z(r, nRows);
      const hi = upper[day], lo = lower[day];
      const yHi = hi == null ? 0 : stage.y(hi);
      const yLo = lo == null ? 0 : stage.y(lo);
      // Before December 2008 the target was a single number, not a range.
      // Give it a little thickness so it does not vanish edge-on.
      const top = Math.max(yHi, yLo + 0.45);

      pos[p] = FF_X; pos[p + 1] = yLo; pos[p + 2] = z; p += 3;
      pos[p] = FF_X; pos[p + 1] = top; pos[p + 2] = z; p += 3;
      line[l] = FF_X; line[l + 1] = top + 0.05; line[l + 2] = z; l += 3;
      if (hi != null) latest = hi;
    }

    if (this.ffRows !== nRows) {
      const idx = this.ffGeo.index.array;
      let k = 0;
      for (let r = 0; r < nRows - 1; r++) {
        const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
      this.ffGeo.index.needsUpdate = true;
      this.ffRows = nRows;
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
    this.wall.material.color.setHex(style.colour);
    this.wallEdge.material.color.setHex(style.colour).offsetHSL(0, 0, 0.22);

    const values = series.values;
    const stage = this.stage;
    const nRows = rows.length;

    let max = 0, min = Infinity, first = null, last = null;
    for (const day of rows) {
      const v = values[day];
      if (v == null) continue;
      if (v > max) max = v;
      if (v < min) min = v;
      if (first === null) first = v;
      last = v;
    }
    if (max <= 0) { this.wall.visible = this.wallEdge.visible = false; return null; }

    const pos = this.wallPos, line = this.wallLinePos;
    let p = 0, l = 0;
    for (let r = 0; r < nRows; r++) {
      const v = values[rows[r]];
      const z = stage.z(r, nRows);
      const h = v == null ? 0 : (v / max) * WALL_H;
      pos[p] = WALL_X; pos[p + 1] = 0; pos[p + 2] = z; p += 3;
      pos[p] = WALL_X; pos[p + 1] = h; pos[p + 2] = z; p += 3;
      line[l] = WALL_X; line[l + 1] = h + 0.05; line[l + 2] = z; l += 3;
    }

    if (this.wallRows !== nRows) {
      const idx = this.wallGeo.index.array;
      let k = 0;
      for (let r = 0; r < nRows - 1; r++) {
        const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
      this.wallGeo.index.needsUpdate = true;
      this.wallRows = nRows;
    }
    this.wallGeo.setDrawRange(0, (nRows - 1) * 6);
    this.wallGeo.attributes.position.needsUpdate = true;
    this.wallGeo.computeBoundingSphere();
    this.wallLineGeo.setDrawRange(0, l / 3);
    this.wallLineGeo.attributes.position.needsUpdate = true;
    this.wallLineGeo.computeBoundingSphere();

    const fmt = (v) => (v * style.scale).toLocaleString("en-US", {
      minimumFractionDigits: style.decimals, maximumFractionDigits: style.decimals,
    }) + (style.unit ? ` ${style.unit}` : "");

    return {
      label: series.label, max, min, first, last,
      maxText: fmt(max), lastText: fmt(last), firstText: fmt(first),
      changePct: first ? ((last - first) / first) * 100 : null,
      wallX: WALL_X, wallTop: WALL_H,
    };
  }

  /* -------------------------------------------------------- QE bands */
  buildRegimes(rows, state) {
    this.regimes.clear();
    if (!state.showRegimes) return [];

    const { dates, manifest } = this.data;
    const stage = this.stage;
    const nRows = rows.length;
    const firstISO = dates[rows[0]], lastISO = dates[rows[nRows - 1]];

    // Map an ISO date onto the mesh's z axis.
    const zFor = (iso) => {
      if (iso <= firstISO) return 0;
      if (iso >= lastISO) return BOX.D;
      let lo = 0, hi = nRows - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dates[rows[mid]] < iso) lo = mid + 1; else hi = mid;
      }
      return stage.z(lo, nRows);
    };

    const verts = [], colours = [], labels = [];
    const marks = [];
    const c = new THREE.Color();

    for (const reg of manifest.regimes) {
      if (reg.end < firstISO || reg.start > lastISO) continue;
      const z0 = zFor(reg.start), z1 = zFor(reg.end);
      if (z1 - z0 < 0.4) continue;

      c.setHex(REGIME_COLOURS[reg.kind] || 0x888888);
      const x0 = FF_X - 3, x1 = WALL_X + 3, y = 0.18;
      const quad = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        verts.push(quad[i][0], quad[i][1], quad[i][2]);
        colours.push(c.r, c.g, c.b);
      }

      // A bright rule at the start of each programme.
      if (reg.start >= firstISO) marks.push(x0, 0.3, z0, x1, 0.3, z0, c.getHex());

      labels.push({
        p: [x1 + 5, 1.5, (z0 + z1) / 2],
        text: reg.name,
        cls: "era",
      });
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
    for (let i = 0; i < marks.length; i += 7) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(marks.slice(i, i + 6), 3));
      this.regimes.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: marks[i + 6], transparent: true, opacity: 0.7,
      })));
    }
    return labels;
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
