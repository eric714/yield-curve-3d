/**
 * The 3D stage: renderer, camera, orbit controls, the box the surface sits in,
 * and the HTML axis labels that track it.
 *
 * Everything is drawn inside a fixed-size box regardless of how many days are
 * on screen, so rotating and zooming behave the same whether you are looking
 * at three months or thirty-six years.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { maturityLabel } from "./data.js";

export const BOX = {
  W: 100,     // maturity axis, 1 month at x=0 to 30 years at x=W
  D: 170,     // time axis, earliest date at z=0 (far) to latest at z=D (near)
  H: 62,      // value axis
  FF_X: -8,   // Fed funds ribbon, just in front of the 1-month edge
  WALL_X: 110,      // context series, just beyond the 30-year edge
  RAIL_X0: 117,     // recession rail: its own lane past the back wall, so it
  RAIL_X1: 126,     // never competes with the QE bands across the floor
};

// Maturities that get a tick and a label. The rest of the grid is unlabelled.
const MATURITY_TICKS = [1 / 12, 0.25, 0.5, 1, 2, 5, 10, 20, 30];

// Camera presets as azimuth (degrees around the vertical axis, 0 = looking
// straight down the time axis), elevation, and distance as a multiple of the
// framing radius. Expressed this way they stay correct if the box changes size.
const VIEWS = {
  default: { az: 41, el: 27, dist: 1.06, target: [0, 6, 0] },
  front:   { az: 0,  el: 11, dist: 0.94, target: [0, 1, 0] },
  side:    { az: 90, el: 14, dist: 1.02, target: [0, 4, 0] },
  top:     { az: 0,  el: 87, dist: 1.00, target: [0, 0, 0] },
};

export class Stage {
  constructor(canvas, labelHost, theme) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      // Needed so the frame can still be read back after rendering, which is
      // how the snapshot tools capture the image.
      preserveDrawingBuffer: true,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 2400);
    this.camera.position.set(200, 150, 240);   // replaced by goTo() on start

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 1100;
    this.controls.maxPolarAngle = Math.PI * 0.995;   // allow looking from below
    this.controls.zoomSpeed = 0.75;

    // The whole scene is shifted so the middle of the box sits at the origin,
    // which makes orbiting feel like turning the object rather than flying
    // around it.
    this.world = new THREE.Group();
    this.world.position.set(-BOX.W / 2, -BOX.H * 0.36, -BOX.D / 2);
    this.scene.add(this.world);

    this.ambient = new THREE.AmbientLight(0xffffff, 1);
    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.key.position.set(0.5, 1, 0.45);
    this.fill = new THREE.DirectionalLight(0xffffff, 1);
    this.fill.position.set(-0.65, 0.3, -0.75);
    this.scene.add(this.ambient, this.key, this.fill);

    this.frame = new THREE.Group();
    this.world.add(this.frame);

    // An invisible floor used only for picking, so the date cursor still works
    // when the pointer is beside the surface rather than on it.
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(BOX.RAIL_X1 - BOX.FF_X + 30, BOX.D + 30),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.pickPlane.position.set((BOX.FF_X + BOX.RAIL_X1) / 2, 0, BOX.D / 2);
    this.world.add(this.pickPlane);

    this.labels = new LabelPool(labelHost);
    this.valueMin = 0;
    this.valueMax = 8;
    this.tween = null;
    this.lastFrame = performance.now();
    this.frameLabels = [];

    this.setTheme(theme);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /* -------------------------------------------------------------- theme */
  setTheme(theme) {
    this.theme = theme;
    this.renderer.setClearColor(theme.background, 1);
    this.scene.fog = new THREE.Fog(theme.background, theme.fog[0], theme.fog[1]);
    this.ambient.color.setHex(theme.ambient[0]);
    this.ambient.intensity = theme.ambient[1];
    this.key.color.setHex(theme.key[0]);
    this.key.intensity = theme.key[1];
    this.fill.color.setHex(theme.fill[0]);
    this.fill.intensity = theme.fill[1];
  }

  resize() {
    const w = this.canvas.clientWidth || 0;
    const h = this.canvas.clientHeight || 0;
    // While the app is still hidden the canvas measures zero. Re-framing from
    // a degenerate aspect ratio would throw the camera to a nonsense distance,
    // so wait until there is a real box to fit.
    if (w < 10 || h < 10) return;

    const before = this.framingDistance();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const after = this.framingDistance();

    // A window that changes shape changes how far back the camera has to sit.
    // Scaling the existing distance by the ratio keeps the user's own zoom and
    // orientation intact while still fitting the new frame. Because the ratio
    // is derived from the aspect alone, repeated resizes at the same size are
    // a no-op rather than compounding.
    if (this.ready) {
      const factor = after / before;
      if (isFinite(factor) && factor > 0 && Math.abs(factor - 1) > 0.002) {
        this.camera.position.sub(this.controls.target)
          .multiplyScalar(factor).add(this.controls.target);
        if (this.tween) {
          this.tween.toPos.sub(this.controls.target)
            .multiplyScalar(factor).add(this.controls.target);
        }
      }
    }
    this.ready = true;
  }

  /* ------------------------------------------------------- coordinates */
  x(col, cols) { return (col / (cols - 1)) * BOX.W; }
  z(row, rows) { return rows < 2 ? BOX.D : (row / (rows - 1)) * BOX.D; }
  y(value) {
    const span = this.valueMax - this.valueMin || 1;
    return ((value - this.valueMin) / span) * BOX.H;
  }

  /** Position along the maturity axis for a maturity in years. */
  xForMaturity(years, maturities) {
    const n = maturities.length;
    if (years <= maturities[0]) return 0;
    if (years >= maturities[n - 1]) return BOX.W;
    let i = 0;
    while (i < n - 2 && maturities[i + 1] < years) i++;
    const f = (years - maturities[i]) / (maturities[i + 1] - maturities[i]);
    return this.x(i + f, n);
  }

  /**
   * Set the vertical scale from the data, rounded outwards to whole gridlines.
   *
   * Zero is kept on the axis when the data already runs near it, or when the
   * mode makes the sign meaningful. Otherwise the box is fitted to the data:
   * a three-week window at four per cent should not be drawn as a flat sheet
   * floating at the top of an empty box.
   */
  setValueRange(dataMin, dataMax, includeZero = false) {
    const span = Math.max(0.2, dataMax - dataMin);
    const nearZero = dataMin >= 0 && dataMin <= span * 0.4;
    const pad = span * 0.08;

    // Pad below the data only when the data actually goes below zero. Padding
    // a zero-based yield axis would put gridlines at negative yields, which
    // have never existed in this series.
    const lo = dataMin < 0 ? dataMin - pad
             : includeZero || nearZero ? 0
             : dataMin - pad;
    const hi = dataMax > 0 ? dataMax + pad : includeZero ? 0 : dataMax + pad;

    const step = niceStep(hi - lo);
    this.step = step;
    const round = (v) => Math.round(v * 1e6) / 1e6;   // keep 0.05 steps clean
    this.valueMin = round(Math.floor(lo / step + 1e-9) * step);
    this.valueMax = round(Math.ceil(hi / step - 1e-9) * step);
    if (this.valueMax - this.valueMin < step * 0.5) this.valueMax = this.valueMin + step;
    this.decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return [this.valueMin, this.valueMax];
  }

  valueTicks() {
    const out = [];
    const n = Math.round((this.valueMax - this.valueMin) / this.step);
    for (let i = 0; i <= n; i++) {
      out.push(Math.round((this.valueMin + i * this.step) * 1000) / 1000);
    }
    return out;
  }

  /* ------------------------------------------------------------- frame */
  buildFrame(maturities, timeMarks, unit = "%", maturityTicks = MATURITY_TICKS) {
    // The frame is rebuilt on every update, so free the previous buffers
    // rather than leaving them allocated on the graphics card.
    for (const child of this.frame.children) {
      child.geometry?.dispose();
      child.material?.dispose();
    }
    this.frame.clear();
    this.frameLabels = [];

    const theme = this.theme;
    const pts = [];
    const push = (a, b) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const { W, D } = BOX;

    // Floor lines running along time, one per labelled maturity.
    for (const m of maturityTicks) {
      const x = this.xForMaturity(m, maturities);
      push([x, 0, 0], [x, 0, D]);
      this.frameLabels.push({ p: [x, -3.5, D + 13], text: maturityLabel(m) });
    }

    // Floor lines running across maturity, one per time mark.
    for (const mark of timeMarks) {
      push([0, 0, mark.z], [W, 0, mark.z]);
      this.frameLabels.push({ p: [-11, -1.5, mark.z], text: mark.label });
    }

    // Value gridlines on the far wall and the short-maturity wall.
    const ticks = this.valueTicks();
    for (const v of ticks) {
      const y = this.y(v);
      push([0, y, 0], [W, y, 0]);
      push([0, y, 0], [0, y, D]);
      const sign = v > 0 && this.valueMin < 0 ? "+" : "";
      const text = `${sign}${v.toFixed(this.decimals)}${unit}`;
      this.frameLabels.push({ p: [-7, y, D + 4], text });
    }

    // Box outline at the base of the value axis.
    const floor = this.y(this.valueMin);
    push([0, floor, 0], [W, floor, 0]); push([W, floor, 0], [W, floor, D]);
    push([W, floor, D], [0, floor, D]); push([0, floor, D], [0, floor, 0]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.frame.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: theme.frame, transparent: true, opacity: 0.9,
    })));

    // Vertical corner posts.
    const posts = [];
    const top = this.y(ticks[ticks.length - 1]);
    for (const [px, pz] of [[0, 0], [W, 0], [0, D]]) {
      posts.push(px, floor, pz, px, top, pz);
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.Float32BufferAttribute(posts, 3));
    this.frame.add(new THREE.LineSegments(
      pgeo, new THREE.LineBasicMaterial({ color: theme.frameEdge })));

    // When the scale straddles zero, mark it: on a spread surface the sign is
    // the whole story, and the eye needs a plane to read it against.
    if (this.valueMin < -1e-9) {
      const y0 = this.y(0);
      const zero = new THREE.Mesh(
        new THREE.PlaneGeometry(W + Math.abs(BOX.FF_X) + 6, D),
        new THREE.MeshBasicMaterial({
          color: theme.zeroPlane, transparent: true, opacity: 0.12,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      zero.rotation.x = -Math.PI / 2;
      zero.position.set((BOX.FF_X - 3 + W + 3) / 2, y0, D / 2);
      this.frame.add(zero);

      const edge = new THREE.BufferGeometry();
      edge.setAttribute("position", new THREE.Float32BufferAttribute(
        [BOX.FF_X - 3, y0, D, W + 3, y0, D, W + 3, y0, D, W + 3, y0, 0], 3));
      this.frame.add(new THREE.LineSegments(edge, new THREE.LineBasicMaterial({
        color: theme.zeroPlane, transparent: true, opacity: 0.75,
      })));
    }

    this.frameLabels.push({ p: [W / 2, -10, D + 30], text: "Maturity", cls: "axis-title" });
  }

  /* -------------------------------------------------------------- views */
  /** Distance at which the whole box comfortably fills the frame. */
  framingDistance() {
    const { D, H, FF_X, RAIL_X1 } = BOX;
    // A bounding sphere over-estimates how much room this flat, wide box
    // needs, so a landscape canvas can afford to move in. A portrait one
    // cannot, and pulling in there pushes the axis labels off screen. Ramp
    // between the two rather than stepping, so a window dragged across the
    // threshold does not jump.
    const slack = Math.min(1, Math.max(0.87, 0.87 + 0.22 * (1.55 - this.camera.aspect)));
    const radius = Math.hypot((RAIL_X1 - FF_X + 24) / 2, H / 2, D / 2) * slack;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    return radius / Math.sin(Math.min(vFov, hFov) / 2);
  }

  goTo(name, instant = false) {
    const view = VIEWS[name] || VIEWS.default;
    const target = new THREE.Vector3(...view.target);
    const d = this.framingDistance() * view.dist;
    const az = (view.az * Math.PI) / 180;
    const el = (view.el * Math.PI) / 180;
    const pos = new THREE.Vector3(
      d * Math.cos(el) * Math.sin(az),
      d * Math.sin(el),
      d * Math.cos(el) * Math.cos(az)
    ).add(target);
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    this.tween = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: pos, toTarget: target, t: 0,
    };
  }

  /* ------------------------------------------------------------- render */
  render(extraLabels = []) {
    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.tween) {
      // Time-based rather than frame-based, so the move takes the same
      // three-quarters of a second on a slow machine as on a fast one.
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + delta / 0.75);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      if (tw.t >= 1) this.tween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.placed = this.drawLabels(extraLabels);
  }

  /** Project world-space label anchors to screen pixels. */
  drawLabels(extra) {
    const all = (this.frameLabels || []).concat(extra);
    this.labels.begin();
    const v = new THREE.Vector3();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const placed = [];
    for (const label of all) {
      v.set(label.p[0], label.p[1], label.p[2]);
      this.world.localToWorld(v);
      v.project(this.camera);
      if (v.z > 1) continue;                       // behind the camera
      const px = (v.x * 0.5 + 0.5) * w;
      const py = (-v.y * 0.5 + 0.5) * h;
      // A label whose anchor is close to an edge would be cut in half by the
      // overlay's clipping, which reads worse than not showing it at all.
      const margin = label.text.length > 10 ? 78 : 30;
      if (px < margin || px > w - margin || py < 12 || py > h - 12) continue;
      this.labels.add(px, py, label.text, label.cls);
      placed.push({ x: px, y: py, text: label.text, cls: label.cls || "" });
    }
    this.labels.end();
    return placed;
  }
}

/**
 * A round gridline interval giving roughly six lines across the axis, from the
 * 1-2-5 sequence people already read scales in.
 */
function niceStep(span) {
  const raw = Math.max(span, 1e-6) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  return (n <= 1.5 ? 1 : n <= 3 ? 2 : n <= 7 ? 5 : 10) * magnitude;
}

/**
 * Reuses a pool of absolutely-positioned <div>s rather than rebuilding the DOM
 * on every frame.
 */
class LabelPool {
  constructor(host) {
    this.host = host;
    this.pool = [];
    this.cursor = 0;
  }
  begin() { this.cursor = 0; }
  add(x, y, text, cls) {
    let el = this.pool[this.cursor];
    if (!el) {
      el = document.createElement("div");
      this.host.appendChild(el);
      this.pool.push(el);
    }
    if (el.textContent !== text) el.textContent = text;
    const className = cls || "";
    if (el.className !== className) el.className = className;
    el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    el.style.display = "";
    this.cursor++;
  }
  end() {
    for (let i = this.cursor; i < this.pool.length; i++) this.pool[i].style.display = "none";
  }
}
