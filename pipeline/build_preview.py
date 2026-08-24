#!/usr/bin/env python3
"""
Render the social preview card.

A link with no preview looks like a pasted URL rather than a site, and this one
has a share button. The card is drawn from the same data the site loads, so it
refreshes itself whenever the daily job runs.

Everything here is standard library. A PNG is a handful of chunks wrapping
zlib-compressed scanlines, and a shaded surface is a painter's-algorithm fill
over projected quads, so neither needs a graphics package.
"""

import json
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "data")
OUT = os.path.join(ROOT, "docs", "preview.png")

WIDTH, HEIGHT = 1200, 630
BACKGROUND = (8, 11, 20)
YEARS_SHOWN = 40        # the whole record; the 1990s supply the warm end
MAX_ROWS = 260          # enough for a smooth surface without a slow render

# The site's sequential ramp, as sRGB. The preview composites in sRGB directly
# rather than in linear light, which is close enough at this size.
STOPS = [
    (0.00, 0x0b, 0x1a, 0x4d), (0.14, 0x13, 0x4e, 0x9b),
    (0.29, 0x16, 0x88, 0xb2), (0.44, 0x36, 0xb1, 0x8b),
    (0.59, 0x9d, 0xc7, 0x5a), (0.74, 0xf2, 0xc5, 0x3c),
    (0.88, 0xef, 0x7d, 0x3a), (1.00, 0xd8, 0x33, 0x2f),
]

AZIMUTH = math.radians(40)
ELEVATION = math.radians(30)
LIGHT = (0.42, 0.84, 0.34)


def ramp(t):
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    i = 0
    while i < len(STOPS) - 2 and t > STOPS[i + 1][0]:
        i += 1
    a, b = STOPS[i], STOPS[i + 1]
    f = (t - a[0]) / (b[0] - a[0])
    return tuple(a[j] + (b[j] - a[j]) * f for j in (1, 2, 3))


class Canvas:
    """An RGB pixel buffer with a z-buffer, and enough of a rasteriser."""

    def __init__(self, w, h, background):
        self.w, self.h = w, h
        self.pixels = bytearray(background * (w * h))

    def triangle(self, p0, p1, p2, color):
        """Fill a projected triangle, clipped to the canvas."""
        pts = sorted((p0, p1, p2), key=lambda p: p[1])
        (x0, y0), (x1, y1), (x2, y2) = pts
        if y2 - y0 < 1e-9:
            return
        r, g, b = (int(c) for c in color)
        buf = self.pixels

        top, bottom = max(0, int(y0)), min(self.h - 1, int(math.ceil(y2)))
        for y in range(top, bottom + 1):
            yc = y + 0.5
            if yc < y0 or yc > y2:
                continue
            xa = x0 + (x2 - x0) * (yc - y0) / (y2 - y0)
            if yc < y1:
                xb = x0 + (x1 - x0) * (yc - y0) / (y1 - y0) if y1 - y0 > 1e-9 else x0
            else:
                xb = x1 + (x2 - x1) * (yc - y1) / (y2 - y1) if y2 - y1 > 1e-9 else x1
            if xa > xb:
                xa, xb = xb, xa
            left, right = max(0, int(xa)), min(self.w - 1, int(math.ceil(xb)))
            if right < left:
                continue
            base = (y * self.w + left) * 3
            for _ in range(right - left + 1):
                buf[base] = r
                buf[base + 1] = g
                buf[base + 2] = b
                base += 3

    def to_png(self, path):
        rows = bytearray()
        stride = self.w * 3
        for y in range(self.h):
            rows.append(0)                      # filter: none
            rows += self.pixels[y * stride:(y + 1) * stride]

        def chunk(kind, payload):
            return (struct.pack(">I", len(payload)) + kind + payload
                    + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF))

        png = b"\x89PNG\r\n\x1a\n"
        png += chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        png += chunk(b"IEND", b"")
        with open(path, "wb") as fh:
            fh.write(png)
        return len(png)


def main():
    with open(os.path.join(DATA, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    with open(os.path.join(DATA, "surface.bin"), "rb") as fh:
        raw = fh.read()

    cols = manifest["gridCount"]
    scale, offset = manifest["scale"], manifest["offset"]
    total = manifest["dayCount"]
    start = max(0, total - YEARS_SHOWN * 252)
    step = max(1, (total - start) // MAX_ROWS)
    days = list(range(start, total, step))

    grid = []
    peak = 0.0
    for day in days:
        base = day * cols * 2
        row = [struct.unpack_from("<H", raw, base + c * 2)[0] / scale - offset
               for c in range(cols)]
        peak = max(peak, max(row))
        grid.append(row)
    peak = max(peak, 0.5)

    n_rows, n_cols = len(grid), cols
    ca, sa = math.cos(AZIMUTH), math.sin(AZIMUTH)
    ce, se = math.cos(ELEVATION), math.sin(ELEVATION)

    def place(r, c):
        """Grid position to a rotated camera-space point."""
        x = (c / (n_cols - 1) - 0.5) * 2.2
        z = (r / (n_rows - 1) - 0.5) * 3.6
        y = (grid[r][c] / peak) * 1.0 - 0.3
        xr = x * ca - z * sa
        zr = x * sa + z * ca
        yr = y * ce - zr * se
        return xr, yr, y * se + zr * ce

    points = [[place(r, c) for c in range(n_cols)] for r in range(n_rows)]

    # Project once at unit scale, measure what it covers, then fit that to the
    # frame. Doing it this way means the card stays well composed whatever the
    # data does, rather than needing the constants retuned by hand.
    def raw_project(p):
        d = 6.2
        f = d / (d + p[2])
        return (p[0] * f, -p[1] * f)

    flat = [raw_project(p) for row in points for p in row]
    min_x = min(q[0] for q in flat); max_x = max(q[0] for q in flat)
    min_y = min(q[1] for q in flat); max_y = max(q[1] for q in flat)
    margin = 40
    fit = min((WIDTH - 2 * margin) / (max_x - min_x or 1),
              (HEIGHT - 2 * margin) / (max_y - min_y or 1))
    off_x = (WIDTH - (max_x - min_x) * fit) / 2 - min_x * fit
    off_y = (HEIGHT - (max_y - min_y) * fit) / 2 - min_y * fit

    def project(p):
        q = raw_project(p)
        return (q[0] * fit + off_x, q[1] * fit + off_y)

    screen = [[project(p) for p in row] for row in points]

    quads = []
    for r in range(n_rows - 1):
        for c in range(n_cols - 1):
            depth = (points[r][c][2] + points[r + 1][c + 1][2]) * 0.5
            quads.append((depth, r, c))
    quads.sort(key=lambda q: -q[0])             # painter's algorithm, far first

    canvas = Canvas(WIDTH, HEIGHT, bytes(BACKGROUND))
    for _depth, r, c in quads:
        a, b, d, e = points[r][c], points[r][c + 1], points[r + 1][c], points[r + 1][c + 1]
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = d[0] - a[0], d[1] - a[1], d[2] - a[2]
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        lit = abs((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / length)
        shade = 0.55 + 0.55 * lit

        value = (grid[r][c] + grid[r][c + 1] + grid[r + 1][c] + grid[r + 1][c + 1]) / 4
        color = tuple(min(255, ch * shade) for ch in ramp(value / peak))

        p0, p1, p2, p3 = screen[r][c], screen[r][c + 1], screen[r + 1][c + 1], screen[r + 1][c]
        canvas.triangle(p0, p1, p2, color)
        canvas.triangle(p0, p2, p3, color)

    size = canvas.to_png(OUT)
    first, last = manifest["dates"][days[0]], manifest["lastDate"]
    print(f"  preview.png   {size / 1024:,.0f} KB  ({first} to {last})")


if __name__ == "__main__":
    main()
