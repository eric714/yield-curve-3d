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
  W: 100,   // maturity axis, 1 month at x=0 to 30 years at x=W
  D: 170,   // time axis, earliest date at z=0 (far) to latest at z=D (near)
  H: 62,    // yield axis
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
  constructor(canvas, labelHost) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x080b14, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x080b14, 340, 860);

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 2000);
    this.camera.position.set(200, 150, 240);   // replaced by goTo() on start

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 900;
    this.controls.maxPolarAngle = Math.PI * 0.995;   // allow looking from below
    this.controls.zoomSpeed = 0.75;

    // The whole scene is shifted so the middle of the box sits at the origin,
    // which makes orbiting feel like turning the object rather than flying
    // around it.
    this.world = new THREE.Group();
    this.world.position.set(-BOX.W / 2, -BOX.H * 0.36, -BOX.D / 2);
    this.scene.add(this.world);

    this.scene.add(new THREE.AmbientLight(0xc3d0e8, 0.34));
    const key = new THREE.DirectionalLight(0xfff4e2, 0.88);
    key.position.set(0.5, 1, 0.45);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x7d9ad0, 0.3);
    fill.position.set(-0.65, 0.3, -0.75);
    this.scene.add(fill);

    this.frame = new THREE.Group();
    this.world.add(this.frame);

    this.labels = new LabelPool(labelHost);
    this.yieldMax = 8;
    this.tween = null;
    this.clock = new THREE.Clock();

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------- coordinates */
  x(col, cols) { return (col / (cols - 1)) * BOX.W; }
  z(row, rows) { return rows < 2 ? BOX.D : (row / (rows - 1)) * BOX.D; }
  y(value)     { return (value / this.yieldMax) * BOX.H; }

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

  /* ------------------------------------------------------------- frame */
  /**
   * Draw the floor grid, the two back walls and their tick marks. Called
   * whenever the yield scale or the visible date range changes.
   */
  buildFrame(maturities, yearMarks) {
    this.frame.clear();
    this.frameLabels = [];

    const faint = new THREE.LineBasicMaterial({ color: 0x263149, transparent: true, opacity: 0.85 });
    const edge  = new THREE.LineBasicMaterial({ color: 0x38465f });
    const pts = [];
    const push = (a, b) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);

    const { W, D, H } = BOX;

    // Floor lines running along time, one per labelled maturity.
    for (const m of MATURITY_TICKS) {
      const x = this.xForMaturity(m, maturities);
      push([x, 0, 0], [x, 0, D]);
      this.frameLabels.push({ p: [x, -3.5, D + 13], text: maturityLabel(m) });
    }

    // Floor lines running across maturity, one per year mark.
    for (const mark of yearMarks) {
      const z = mark.z;
      push([0, 0, z], [W, 0, z]);
      this.frameLabels.push({ p: [-11, -1.5, z], text: mark.label });
    }

    // Yield gridlines on the far wall and the short-maturity wall.
    const ticks = this.yieldTicks();
    for (const v of ticks) {
      const y = this.y(v);
      push([0, y, 0], [W, y, 0]);      // far wall
      push([0, y, 0], [0, y, D]);      // left wall
      this.frameLabels.push({ p: [-7, y, D + 4], text: `${v}%` });
    }

    // Box edges.
    push([0, 0, 0], [W, 0, 0]); push([W, 0, 0], [W, 0, D]);
    push([W, 0, D], [0, 0, D]); push([0, 0, D], [0, 0, 0]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.frame.add(new THREE.LineSegments(geo, faint));

    // The three vertical corner posts, slightly brighter.
    const posts = [];
    const pp = (a, b) => posts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const top = this.y(ticks[ticks.length - 1]);
    pp([0, 0, 0], [0, top, 0]);
    pp([W, 0, 0], [W, top, 0]);
    pp([0, 0, D], [0, top, D]);
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.Float32BufferAttribute(posts, 3));
    this.frame.add(new THREE.LineSegments(pgeo, edge));

    this.frameLabels.push({ p: [W / 2, -10, D + 30], text: "Maturity", cls: "axis-title" });
    this.frameLabels.push({ p: [-20, top * 0.58, D + 4], text: "Yield", cls: "axis-title" });
  }

  /** Round, evenly spaced yield gridlines that reach just past the data. */
  yieldTicks() {
    const step = this.yieldMax > 9 ? 2 : this.yieldMax > 4.5 ? 2 : this.yieldMax > 2 ? 1 : 0.5;
    const out = [];
    for (let v = 0; v <= this.yieldMax + 1e-6; v += step) out.push(Math.round(v * 10) / 10);
    return out;
  }

  /** Set the vertical scale, rounded up so the top gridline is a round number. */
  setYieldMax(dataMax) {
    const step = dataMax > 9 ? 2 : dataMax > 4.5 ? 2 : dataMax > 2 ? 1 : 0.5;
    this.yieldMax = Math.max(step, Math.ceil((dataMax * 1.06) / step) * step);
    return this.yieldMax;
  }

  /* -------------------------------------------------------------- views */
  /** Distance at which the whole box comfortably fills the frame. */
  framingDistance() {
    const { W, D, H } = BOX;
    // A bounding sphere over-estimates how much room a flat, wide box needs,
    // so on a landscape canvas we can safely move in. A portrait phone has no
    // such slack, and pulling in there would push the axis labels off screen.
    const slack = this.camera.aspect >= 1.3 ? 0.85 : 0.99;
    const radius = Math.hypot((W + 28) / 2, H / 2, D / 2) * slack;
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

  /* -------------------------------------------------------------- frame */
  render(extraLabels = []) {
    const delta = this.clock.getDelta();
    if (this.tween) {
      // Time-based rather than frame-based, so the move takes the same
      // three-quarters of a second on a slow machine as on a fast one.
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + delta / 0.75);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;  // ease in-out
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      if (tw.t >= 1) this.tween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.drawLabels(extraLabels);
  }

  drawLabels(extra) {
    const all = (this.frameLabels || []).concat(extra);
    this.labels.begin();
    const v = new THREE.Vector3();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
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
    }
    this.labels.end();
  }
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
