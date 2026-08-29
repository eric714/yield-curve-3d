#!/usr/bin/env python3
"""
Stamp the code files with a content hash so a browser cannot serve stale ones.

The data files already carry a version: the pipeline writes a hash into
manifest.json and everything else is fetched with ?v= behind it. The code files
had nothing, and GitHub Pages serves them with max-age=600. So for ten minutes
after a push a visitor could hold an old app.js against a new index.html, which
does not look broken, it just behaves like the version before the change.

Versioning the entry point alone would be worse than nothing, because the
modules import each other by relative path and would stay stale while app.js
went fresh. The import map fixes that: a browser resolves "./layers.js" and
then consults the map, so one entry per module versions the whole graph.

Run from anywhere:

    python3 pipeline/stamp.py

Idempotent. It strips any existing ?v= before writing the new one, and only
touches index.html when the hash actually changed.
"""

import glob
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "docs", "index.html")


def code_files():
    """Everything a browser caches separately from index.html."""
    js = sorted(glob.glob(os.path.join(ROOT, "docs", "js", "*.js")))
    return js + [os.path.join(ROOT, "docs", "style.css")]


def version():
    """A hash of the code, so the stamp changes when and only when code does."""
    h = hashlib.sha256()
    for path in code_files():
        h.update(os.path.basename(path).encode())
        with open(path, "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()[:10]


def strip(url):
    return re.sub(r"\?v=[0-9a-f]+", "", url)


def stamp(html, v):
    names = [os.path.basename(p) for p in sorted(
        glob.glob(os.path.join(ROOT, "docs", "js", "*.js")))]

    html = re.sub(r'href="(style\.css)(\?v=[0-9a-f]+)?"',
                  lambda m: f'href="{m.group(1)}?v={v}"', html, count=1)
    html = re.sub(r'src="(js/app\.js)(\?v=[0-9a-f]+)?"',
                  lambda m: f'src="{m.group(1)}?v={v}"', html, count=1)

    # Rebuild the local half of the import map, leaving the three.js entries
    # alone. Keys are written the way the document resolves them.
    local = ",\n".join(
        f'      "./js/{n}": "./js/{n}?v={v}"' for n in names)

    def redo_map(match):
        body = match.group(1)
        body = re.sub(r',?\n\s*"\./js/[^"]+":\s*"[^"]+"', "", body)
        body = body.rstrip().rstrip("}").rstrip().rstrip(",")
        return '<script type="importmap">\n{ "imports": {' + body + \
               ",\n" + local + "\n  } }\n</script>"

    html = re.sub(r'<script type="importmap">\s*\{\s*"imports":\s*\{(.*?)\}\s*\}\s*</script>',
                  redo_map, html, count=1, flags=re.S)
    return html


def main():
    v = version()
    with open(INDEX, encoding="utf-8") as fh:
        before = fh.read()
    after = stamp(before, v)
    if after == before:
        print(f"Code version {v}, already stamped.")
        return 0
    with open(INDEX, "w", encoding="utf-8") as fh:
        fh.write(after)
    print(f"Stamped code version {v}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
