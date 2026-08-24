/**
 * Light and dark palettes.
 *
 * The 3D scene cannot read CSS variables, so every color it needs lives here
 * as a number and every color the page needs lives here as a CSS string. One
 * definition, two consumers.
 */

export const THEMES = {
  dark: {
    name: "dark",
    background: 0x080b14,
    fog: [340, 880],
    frame: 0x263149,
    frameEdge: 0x38465f,
    zeroPlane: 0x5c6f92,
    // three.js divides diffuse by pi, so the intensities have to sum to about
    // pi for the surface to render at the color the ramp actually specifies.
    ambient: [0xc3d0e8, 0.95],
    key: [0xfff4e2, 2.05],
    fill: [0x7d9ad0, 0.55],
    // Recession shading: how far toward the tint, and what tint.
    shadow: { amount: 0.52, tint: [0.09, 0.11, 0.17] },
    surfaceLift: 0,
    recessionRail: 0x2a3247,
    fedFunds: 0xf2a03c,
    fedFundsEdge: 0xffc472,
    curveLine: 0.28,          // multiplier on the surface color
    cursor: 0xffffff,
    eventMark: 0xffd479,
    css: {
      "--bg": "#080b14",
      "--bg-panel": "#0e1322",
      "--bg-float": "rgba(10,14,24,.93)",
      "--line": "#1e2739",
      "--ink": "#e8ecf5",
      "--ink-dim": "#8b98b4",
      "--ink-faint": "#5a6782",
      "--accent": "#f2a03c",
      "--accent-2": "#4fb8e8",
      "--shadow": "0 8px 28px rgba(0,0,0,.55)",
    },
  },

  light: {
    name: "light",
    background: 0xf4f6fa,
    fog: [420, 1050],
    frame: 0xc3cbd9,
    frameEdge: 0x9aa5b8,
    zeroPlane: 0x8792a6,
    // Flatter, brighter lighting: strong directional shading reads as dirt on
    // a pale ground, where on a dark ground it reads as form.
    // Same total as the dark theme, but weighted toward ambient: strong
    // directional shading reads as form on a dark ground and as dirt on a
    // pale one.
    ambient: [0xffffff, 1.78],
    key: [0xfff6e8, 1.30],
    fill: [0xdce6f5, 0.42],
    // A touch of white mixed in so the dark ends of the ramp do not sit too
    // heavily on a pale page.
    surfaceLift: 0.10,
    shadow: { amount: 0.4, tint: [0.42, 0.45, 0.52] },
    recessionRail: 0xb6bfcd,
    fedFunds: 0xd97f14,
    fedFundsEdge: 0xa85e05,
    curveLine: 0.55,
    cursor: 0x1a2233,
    eventMark: 0x9a6a10,
    css: {
      "--bg": "#f4f6fa",
      "--bg-panel": "#ffffff",
      "--bg-float": "rgba(255,255,255,.95)",
      "--line": "#dfe4ec",
      "--ink": "#141a26",
      "--ink-dim": "#55617a",
      "--ink-faint": "#8a94a8",
      "--accent": "#c97a12",
      "--accent-2": "#1d7fb8",
      "--shadow": "0 8px 28px rgba(20,30,50,.14)",
    },
  },
};

const STORE_KEY = "yc3d-theme";

/** The theme to start in: an earlier choice, else the system preference. */
export function initialTheme() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (err) {
    /* private browsing blocks storage; fall through to the system setting */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light" : "dark";
}

export function remember(name) {
  try { localStorage.setItem(STORE_KEY, name); } catch (err) { /* no-op */ }
}

/** Push a theme's colors into the document as CSS custom properties. */
export function applyCss(theme) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.css)) {
    root.style.setProperty(prop, value);
  }
  root.dataset.theme = theme.name;
  document.querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme.name);
}
