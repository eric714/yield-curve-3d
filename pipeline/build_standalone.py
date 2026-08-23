#!/usr/bin/env python3
"""
Bundle the whole site into one self-contained HTML file.

The result needs no web server and no internet connection: open it by
double-clicking, or email it to someone. Everything - the graphics library,
the code, and all 36 years of data - is embedded in the single file.

Each JavaScript module is turned into a blob URL at load time and its imports
are rewired to point at the others, so the browser still loads them as proper
ES modules rather than one concatenated blob. That avoids the name collisions
a naive text merge would cause.

Run after build_data.py:   python3 pipeline/build_standalone.py
"""

import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
OUT = os.path.join(ROOT, "dist", "shape-of-money.html")

# Load order matters: a module's dependencies must already have a blob URL.
MODULES = [
    "vendor/three.core.js",
    "vendor/three.module.js",
    "vendor/OrbitControls.js",
    "js/theme.js",
    "js/colormap.js",
    "js/interpolate.js",
    "js/data.js",
    "js/scene.js",
    "js/layers.js",
    "js/inspector.js",
    "js/snapshot.js",
    "js/tour.js",
    "js/app.js",
]

# Import specifier -> the module that satisfies it.
RESOLVE = {
    "./three.core.js": "vendor/three.core.js",
    "three": "vendor/three.module.js",
    "three/addons/OrbitControls.js": "vendor/OrbitControls.js",
    "./colormap.js": "js/colormap.js",
    "./data.js": "js/data.js",
    "./scene.js": "js/scene.js",
    "./layers.js": "js/layers.js",
    "./theme.js": "js/theme.js",
    "./inspector.js": "js/inspector.js",
    "./snapshot.js": "js/snapshot.js",
    "./interpolate.js": "js/interpolate.js",
    "./tour.js": "js/tour.js",
}

DATA_FILES = ["data/manifest.json", "data/context.json",
              "data/surface.bin", "data/tenors.bin"]

SPECIFIER = re.compile(r"""(from\s*|import\s*\(\s*)(['"])([^'"]+)\2""")


def read(path, binary=False):
    with open(os.path.join(DOCS, path), "rb" if binary else "r",
              encoding=None if binary else "utf-8") as fh:
        return fh.read()


def b64(raw):
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def rewrite_imports(source):
    """Replace bare import specifiers with a lookup the loader can resolve."""
    def swap(match):
        prefix, quote, spec = match.group(1), match.group(2), match.group(3)
        target = RESOLVE.get(spec)
        if target is None:
            return match.group(0)
        return f"{prefix}{quote}@@{target}@@{quote}"
    return SPECIFIER.sub(swap, source)


def check_coverage():
    """Fail loudly if a module or an import was added without registering it.

    A missed entry produces a bundle that loads and then dies on an unresolved
    import, which is a much worse failure than not building at all.
    """
    listed = set(MODULES)
    problems = []
    for name in sorted(os.listdir(os.path.join(DOCS, "js"))):
        if not name.endswith(".js"):
            continue
        key = f"js/{name}"
        if key not in listed:
            problems.append(f"{key} is not in MODULES")
        for spec in re.findall(r'from\s+"(\./[^"]+)"', read(key)):
            if spec not in RESOLVE:
                problems.append(f"{key} imports {spec}, which is not in RESOLVE")
    if problems:
        raise SystemExit("Cannot bundle:\n  " + "\n  ".join(problems))


def main():
    check_coverage()
    html = read("index.html")
    css = read("style.css")

    modules = {name: b64(rewrite_imports(read(name))) for name in MODULES}
    data = {name: b64(read(name, binary=True)) for name in DATA_FILES}

    def entries(mapping):
        return ",\n".join(f'  {name!r}: "{blob}"'.replace("'", '"')
                          for name, blob in mapping.items())

    loader = f"""<script>
(function () {{
  const ORDER = {[m for m in MODULES]!r};
  const CODE = {{
{entries(modules)}
  }};
  const DATA = {{
{entries(data)}
  }};

  const bytes = (s) => {{
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }};

  // The app fetches its data by relative path. There is no server here, so
  // answer those requests from the embedded copies instead.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {{
    // Strip any cache-busting query: the embedded copies are keyed by path.
    const url = String(input && input.url ? input.url : input).split("?")[0];
    if (Object.prototype.hasOwnProperty.call(DATA, url)) {{
      return Promise.resolve(new Response(bytes(DATA[url]), {{
        status: 200,
        headers: {{ "Content-Type": url.endsWith(".json")
          ? "application/json" : "application/octet-stream" }},
      }}));
    }}
    return realFetch(input, init);
  }};

  const decoder = new TextDecoder();
  const urls = {{}};
  for (const name of ORDER) {{
    let src = decoder.decode(bytes(CODE[name]));
    src = src.replace(/@@([^@]+)@@/g, (_, dep) => urls[dep]);
    urls[name] = URL.createObjectURL(new Blob([src], {{ type: "text/javascript" }}));
  }}

  import(urls["js/app.js"]).catch((err) => {{
    document.getElementById("loading").textContent =
      "Could not start: " + err.message;
  }});
}})();
</script>"""

    html = html.replace('<link rel="stylesheet" href="style.css">',
                        f"<style>\n{css}\n</style>")
    html = re.sub(r'<script type="importmap">.*?</script>', "", html, flags=re.S)
    html = html.replace('<script type="module" src="js/app.js"></script>', loader)
    # The licence file is not bundled, so drop the link but keep the credit.
    html = html.replace('<a href="vendor/THREE-LICENSE.txt">three.js</a>', "three.js")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)

    print(f"Wrote {OUT}")
    print(f"  {os.path.getsize(OUT) / 1_048_576:.1f} MB, self-contained")


if __name__ == "__main__":
    main()
