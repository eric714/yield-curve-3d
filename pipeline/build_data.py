#!/usr/bin/env python3
"""
Build the 3D yield-curve dataset.

Fetches US Treasury daily par yield curve rates and a handful of FRED context
series, caches the raw downloads under data/raw/, then renders a dense,
gap-free yield surface into docs/data/ for the website to load.

Only new data is downloaded. Historic files, once cached, are never re-fetched.

No third-party packages. Python 3.9+ standard library only.
"""

import csv
import datetime as dt
import hashlib
import io
import json
import re
import zipfile
import os
import struct
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_TREASURY = os.path.join(ROOT, "data", "raw", "treasury")
RAW_FRED = os.path.join(ROOT, "data", "raw", "fred")
OUT = os.path.join(ROOT, "docs", "data")

FIRST_YEAR = 1990          # Treasury's daily par yield curve begins 1990-01-02
# The "compatible" form is the conventional way for a tool to identify itself
# while still getting past user-agent filtering, which some content delivery
# networks apply to requests from datacenter addresses.
USER_AGENT = ("Mozilla/5.0 (compatible; yieldcurve3d/1.0; "
              "+https://yieldcurve3d.com)")

# ---------------------------------------------------------------------------
# Tenor definitions
# ---------------------------------------------------------------------------
# Treasury has added and dropped tenors over the years. Every column header the
# CSVs have ever used, mapped to its maturity in years.
TENORS = [
    ("1 Mo",       1 / 12),
    ("1.5 Month",  1.5 / 12),
    ("2 Mo",       2 / 12),
    ("3 Mo",       3 / 12),
    ("4 Mo",       4 / 12),
    ("6 Mo",       6 / 12),
    ("1 Yr",       1.0),
    ("2 Yr",       2.0),
    ("3 Yr",       3.0),
    ("5 Yr",       5.0),
    ("7 Yr",       7.0),
    ("10 Yr",     10.0),
    ("20 Yr",     20.0),
    ("30 Yr",     30.0),
]
TENOR_YEARS = [t[1] for t in TENORS]

# Output grid: 48 samples spaced evenly in maturity raised to WARP.
#
# Even spacing in raw years wastes half the surface on the 20-30yr stretch and
# crushes the short end, where nearly all the motion is. A square root over-
# corrects and jams the bill maturities together. 0.32 spreads 1 month to
# 1 year across a fifth of the axis while still leaving the 10-30yr section
# room to read.
GRID_N = 48
WARP = 0.32
M_MIN, M_MAX = 1 / 12, 30.0

# Yields are stored as uint16 with a +5% offset, so the format survives
# negative yields if the US ever gets them. 0.001% resolution.
SCALE = 1000.0
OFFSET = 5.0

FRED_SERIES = {
    "DFEDTAR":   "Fed funds target rate (single value, through Dec 2008)",
    "DFEDTARU":  "Fed funds target range, upper bound",
    "DFEDTARL":  "Fed funds target range, lower bound",
    "EFFR":      "Effective fed funds rate",
    "WALCL":     "Federal Reserve total assets",
    "NASDAQCOM": "NASDAQ Composite Index",
    "VIXCLS":    "CBOE Volatility Index",
    "SP500":       "S&P 500 (FRED, last 10 years)",
    # Two variants, because neither alone spans what NBER actually published.
    # USRECDP includes the peak month but drops the trough; USRECD does the
    # reverse. Taking the start from one and the end from the other gives the
    # dates everybody quotes: July 1990 to March 1991, and so on.
    "USRECDP":     "NBER recession indicator, daily, peak included",
    "USRECD":      "NBER recession indicator, daily, trough included",
    "THREEFYTP10": "10-year Treasury term premium (ACM)",
}

# S&P 500 index values are the property of S&P Dow Jones Indices, and the daily
# closes here came from a Yahoo Finance download whose terms bar commercial
# redistribution. Neither matters while the site is free and non-commercial,
# and nothing else depends on this series: the NASDAQ Composite covers 1971
# onwards and the VIX starts the same day the yield curve does. If this site
# ever earns money, remove "SP500" from the series list below and from the
# dropdown in docs/index.html, and everything else keeps working.
#
# Yahoo Finance daily S&P 500, supplied as a spreadsheet. FRED only carries the
# last ten years because of index licensing, so the workbook provides the deep
# history and FRED extends it to the present. The two overlap by four and a
# half years and agree to a mean of 0.001 index points, so the join is clean.
SP500_XLSX = "sp500-1982-2021.xlsx"
SP500_SPLICE = "2021-03-25"     # last date taken from the workbook


# ---------------------------------------------------------------------------
# Downloading
# ---------------------------------------------------------------------------
class DownloadFailed(Exception):
    """Any reason a download did not produce usable text.

    Wrapping them all is deliberate. A read that times out raises TimeoutError,
    a refused connection raises URLError, a truncated response raises something
    else again, and the caller's answer is the same in every case: keep the
    copy already on disk and carry on.
    """


def _ssl_context():
    """Build an SSL context, hunting for a CA bundle if the default has none.

    Python installed from python.org on macOS ships without a certificate
    store unless you run its "Install Certificates" script, so verification
    fails out of the box. CI runners are fine. This looks for the system
    bundle instead of asking anyone to debug certificates.
    """
    import ssl
    ctx = ssl.create_default_context()
    if ctx.cert_store_stats().get("x509_ca", 0) > 0:
        return ctx
    for candidate in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt",
                      "/usr/local/etc/openssl/cert.pem"):
        if os.path.exists(candidate):
            try:
                ctx.load_verify_locations(cafile=candidate)
                return ctx
            except Exception:
                continue
    return ctx


_SSL_CTX = None


def fetch(url, timeout=30, attempts=3):
    """Download a URL as text, retrying briefly before giving up.

    Falls back to curl if urllib has no certificate store.
    """
    global _SSL_CTX
    if _SSL_CTX is None:
        _SSL_CTX = _ssl_context()

    last = None
    for attempt in range(attempts):
        if attempt:
            time.sleep(2 * attempt)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
                return resp.read().decode("utf-8-sig")
        except Exception as exc:
            last = exc
            if "CERTIFICATE_VERIFY_FAILED" not in str(exc):
                continue
            import shutil
            import subprocess
            curl = shutil.which("curl")
            if not curl:
                continue
            try:
                done = subprocess.run(
                    [curl, "-sSL", "--max-time", str(timeout), "-A", USER_AGENT, url],
                    capture_output=True, timeout=timeout + 20,
                )
                if done.returncode == 0:
                    return done.stdout.decode("utf-8-sig")
                last = RuntimeError(done.stderr.decode("utf-8", "replace")[:200])
            except Exception as curl_exc:
                last = curl_exc

    raise DownloadFailed(f"{type(last).__name__}: {last}")


def treasury_url(year):
    return (
        "https://home.treasury.gov/resource-center/data-chart-center/"
        f"interest-rates/daily-treasury-rates.csv/{year}/all"
        f"?type=daily_treasury_yield_curve&field_tdr_date_value={year}"
        "&page&_format=csv"
    )


def fred_url(series_id):
    return f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"


def sync_treasury(today):
    """Download any Treasury year files we're missing, plus the current year.

    Finished years never change, so once cached they are never fetched again.
    """
    os.makedirs(RAW_TREASURY, exist_ok=True)
    fetched, cached = [], []
    for year in range(FIRST_YEAR, today.year + 1):
        path = os.path.join(RAW_TREASURY, f"{year}.csv")
        is_current = year >= today.year
        if os.path.exists(path) and not is_current:
            cached.append(year)
            continue
        try:
            text = fetch(treasury_url(year))
        except DownloadFailed as exc:
            if os.path.exists(path):
                print(f"  ! {year}: download failed ({exc}), keeping cached copy")
                cached.append(year)
                continue
            raise SystemExit(
                f"Cannot fetch {year} and there is no cached copy: {exc}")
        if "Date" not in text.split("\n", 1)[0]:
            print(f"  ! {year}: unexpected response, skipping")
            continue
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        fetched.append(year)
    print(f"  treasury: {len(cached)} cached, {len(fetched)} downloaded {fetched}")
    return today.year in fetched


def last_observation(path):
    """Date of the final row in a cached FRED CSV, or None."""
    try:
        with open(path, encoding="utf-8") as fh:
            rows = [r for r in fh.read().strip().split("\n") if r]
        return datetime.strptime(rows[-1].split(",")[0], "%Y-%m-%d").date()
    except Exception:
        return None


def sync_fred(today):
    """Refresh FRED series only when the cached copy has gone stale."""
    os.makedirs(RAW_FRED, exist_ok=True)
    stale_after = today - timedelta(days=4)   # covers weekends and holidays
    for series_id in FRED_SERIES:
        path = os.path.join(RAW_FRED, f"{series_id}.csv")
        last = last_observation(path)
        if last is not None and last >= stale_after:
            print(f"  fred {series_id}: current through {last}, skipped")
            continue
        try:
            text = fetch(fred_url(series_id))
        except DownloadFailed as exc:
            print(f"  ! fred {series_id}: download failed ({exc})")
            continue
        if not text.lstrip().lower().startswith("observation_date"):
            print(f"  ! fred {series_id}: not a CSV, series may have been withdrawn")
            continue
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print(f"  fred {series_id}: downloaded through {last_observation(path)}")


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
KNOWN_COLUMNS = {"Date"} | {label for label, _ in TENORS}


def read_treasury():
    """-> {date: {maturity_years: yield_pct}} across every cached year file."""
    curves = {}
    unknown = set()
    for name in sorted(os.listdir(RAW_TREASURY)):
        if not name.endswith(".csv"):
            continue
        with open(os.path.join(RAW_TREASURY, name), encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            unknown |= {c for c in (reader.fieldnames or []) if c not in KNOWN_COLUMNS}
            for row in reader:
                raw_date = (row.get("Date") or "").strip()
                if not raw_date:
                    continue
                try:
                    day = datetime.strptime(raw_date, "%m/%d/%Y").date()
                except ValueError:
                    continue
                point = {}
                for label, years in TENORS:
                    cell = (row.get(label) or "").strip()
                    if cell in ("", "N/A", "ND"):
                        continue
                    try:
                        point[years] = float(cell)
                    except ValueError:
                        continue
                if point:
                    curves[day] = point

    if unknown:
        print(f"  ! Treasury is publishing maturities this build does not know "
              f"about: {sorted(unknown)}")
        print(f"  ! They are being ignored. Add them to TENORS in this file to "
              f"include them.")
    return curves


def read_sp500_xlsx():
    """Read Date and Close from the supplied .xlsx without any dependencies.

    An .xlsx file is a zip of XML, so the standard library can open it. Dates
    are stored as a day count from 30 December 1899.
    """
    path = os.path.join(ROOT, "data", "raw", SP500_XLSX)
    if not os.path.exists(path):
        return {}

    epoch = dt.date(1899, 12, 30)
    cell = re.compile(
        r'<c r="([A-Z]+)\d+"(?: s="\d+")?(?: t="\w+")?[^>]*>(?:<v>([^<]*)</v>)?</c>'
    )
    out = {}
    with zipfile.ZipFile(path) as archive:
        sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")

        # Confirm column E really is the close, rather than trusting position.
        shared = [
            re.sub(r"<[^>]+>", "", chunk)
            for chunk in re.findall(r"<si>(.*?)</si>", archive.read(
                "xl/sharedStrings.xml").decode("utf-8"), re.S)
        ]
        header = dict(zip("BCDEFG", shared))
        if header.get("E", "").strip().lower() != "close":
            print(f"  ! {SP500_XLSX}: column E is '{header.get('E')}', not Close")
            return {}

        for _row, body in re.findall(r'<row [^>]*r="(\d+)"[^>]*>(.*?)</row>', sheet, re.S):
            cells = {ref: val for ref, val in cell.findall(body)}
            try:
                serial = int(float(cells.get("A") or 0))
                close = float(cells.get("E") or "")
            except ValueError:
                continue
            if serial < 1000 or close <= 0:
                continue
            out[epoch + dt.timedelta(days=serial)] = close
    return out


def build_sp500():
    """Workbook history spliced to the FRED feed, as one continuous series."""
    workbook = read_sp500_xlsx()
    fred = read_fred("SP500")
    if not workbook:
        return fred

    splice = dt.date.fromisoformat(SP500_SPLICE)
    merged = {d: v for d, v in workbook.items() if d <= splice}
    merged.update({d: v for d, v in fred.items() if d > splice})

    overlap = sorted(set(workbook) & set(fred))
    if overlap:
        gaps = [abs(workbook[d] - fred[d]) for d in overlap]
        print(f"  sp500: {len(workbook)} from workbook + {len(fred)} from FRED, "
              f"{len(overlap)} overlapping days agree to "
              f"{sum(gaps) / len(gaps):.4f} points on average")
    return merged


def read_fred(series_id):
    """-> {date: float}, skipping the '.' placeholders FRED uses for gaps."""
    path = os.path.join(RAW_FRED, f"{series_id}.csv")
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8-sig") as fh:
        for row in csv.reader(fh):
            if len(row) < 2 or row[0] == "observation_date":
                continue
            try:
                out[datetime.strptime(row[0], "%Y-%m-%d").date()] = float(row[1])
            except ValueError:
                continue
    return out


# ---------------------------------------------------------------------------
# Interpolation
# ---------------------------------------------------------------------------
def pchip(xs, ys, targets):
    """Monotone cubic Hermite interpolation (Fritsch-Carlson).

    A plain cubic spline overshoots between points and invents humps in the
    curve that were never in the data. This variant cannot overshoot.
    """
    n = len(xs)
    if n == 0:
        return [None] * len(targets)
    if n == 1:
        return [ys[0]] * len(targets)

    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    delta = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]

    # Slope at each knot.
    d = [0.0] * n
    d[0] = delta[0]
    d[-1] = delta[-1]
    for i in range(1, n - 1):
        if delta[i - 1] * delta[i] <= 0:
            d[i] = 0.0          # local extremum: flatten to prevent overshoot
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])

    out = []
    for x in targets:
        if x <= xs[0]:
            out.append(ys[0] + d[0] * (x - xs[0]))
            continue
        if x >= xs[-1]:
            out.append(ys[-1] + d[-1] * (x - xs[-1]))
            continue
        lo, hi = 0, n - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if xs[mid] <= x:
                lo = mid
            else:
                hi = mid
        t = (x - xs[lo]) / h[lo]
        t2, t3 = t * t, t * t * t
        out.append(
            ys[lo] * (2 * t3 - 3 * t2 + 1)
            + h[lo] * d[lo] * (t3 - 2 * t2 + t)
            + ys[lo + 1] * (-2 * t3 + 3 * t2)
            + h[lo] * d[lo + 1] * (t3 - t2)
        )
    return out


def fill_edge_tenor(curves, days, target, anchor):
    """Reconstruct a missing long-end tenor from its spread to a nearby tenor.

    The 30-year bond was discontinued Feb 2002 - Feb 2006, leaving a four-year
    hole at the *outer edge* of the surface. There is nothing beyond it to
    interpolate across, so instead we interpolate the 30yr-minus-20yr spread
    forward through time and add it back to the 20yr.

    Returns the set of days that were reconstructed.
    """
    known = [
        (i, curves[d][target] - curves[d][anchor])
        for i, d in enumerate(days)
        if target in curves[d] and anchor in curves[d]
    ]
    if not known:
        return set()

    filled = set()
    for i, day in enumerate(days):
        if target in curves[day] or anchor not in curves[day]:
            continue
        before = next((s for j, s in reversed(known) if j < i), None)
        after = next((s for j, s in known if j > i), None)
        if before is not None and after is not None:
            j0 = max(j for j, _ in known if j < i)
            j1 = min(j for j, _ in known if j > i)
            frac = (i - j0) / (j1 - j0)
            spread = before + (after - before) * frac
        else:
            spread = before if before is not None else after
        curves[day][target] = curves[day][anchor] + spread
        filled.add(day)
    return filled


# ---------------------------------------------------------------------------
# Surface construction
# ---------------------------------------------------------------------------
def build_surface(curves, fed_anchor):
    days = sorted(curves)
    lo, hi = M_MIN ** WARP, M_MAX ** WARP
    grid_m = [
        (lo + (hi - lo) * i / (GRID_N - 1)) ** (1 / WARP)
        for i in range(GRID_N)
    ]
    grid_x = [m ** WARP for m in grid_m]

    reconstructed = fill_edge_tenor(curves, days, 30.0, 20.0)
    print(f"  reconstructed 30yr on {len(reconstructed)} days (2002-2006 gap)")

    values = bytearray()
    tenor_rows = bytearray()      # the 14 canonical tenors, plus a published mask
    real_lo, real_hi = [], []
    short_anchored = 0

    for day in days:
        point = curves[day]
        native = sorted(point)

        xs = [m ** WARP for m in native]
        ys = [point[m] for m in native]

        # Before Jul 2001 the curve started at 3 months. Anchor the short end
        # with the overnight policy rate so the 1-3 month corner is filled from
        # real data rather than extrapolated off the end of the curve.
        anchor_rate = fed_anchor.get(day)
        if anchor_rate is not None and native[0] > 0.2:
            xs.insert(0, 0.0)
            ys.insert(0, anchor_rate)
            short_anchored += 1

        pack = lambda v: struct.pack(
            "<H", max(0, min(65535, int(round((v + OFFSET) * SCALE)))))

        for v in pchip(xs, ys, grid_x):
            values += pack(v)

        # The readout panel quotes the tenors Treasury actually publishes, not
        # points off the resampled grid, so store those separately along with a
        # bit per tenor saying whether the number was published or filled in.
        wanted = [m for m in TENOR_YEARS if m not in point]
        filled = dict(zip(wanted, pchip(xs, ys, [m ** WARP for m in wanted]))) if wanted else {}
        mask = 0
        for i, m in enumerate(TENOR_YEARS):
            if m in point and not (m == 30.0 and day in reconstructed):
                mask |= 1 << i
            tenor_rows += pack(point.get(m, filled.get(m, 0.0)))
        tenor_rows += struct.pack("<H", mask)

        # Which part of this day's row came from published Treasury tenors, so
        # the site can visually mark everything outside it as reconstructed.
        observed = [m for m in native if not (m == 30.0 and day in reconstructed)]
        lo, hi = min(observed), max(observed)
        real_lo.append(min(range(GRID_N), key=lambda i: abs(grid_m[i] - lo)))
        real_hi.append(min(range(GRID_N), key=lambda i: abs(grid_m[i] - hi)))

    print(f"  short end anchored to policy rate on {short_anchored} days")
    return days, grid_m, bytes(values), bytes(tenor_rows), real_lo, real_hi


# ---------------------------------------------------------------------------
# Context series
# ---------------------------------------------------------------------------
def build_context(days):
    """Fed funds, balance sheet and market series, aligned to the trading days."""
    day_set = set(days)
    target_old = read_fred("DFEDTAR")
    upper, lower = read_fred("DFEDTARU"), read_fred("DFEDTARL")
    effr = read_fred("EFFR")

    ff_upper, ff_lower = [], []
    for day in days:
        if day in upper:
            ff_upper.append(upper[day])
            ff_lower.append(lower.get(day, upper[day]))
        elif day in target_old:
            ff_upper.append(target_old[day])
            ff_lower.append(target_old[day])
        else:
            ff_upper.append(None)
            ff_lower.append(None)
    ff_upper = forward_fill(ff_upper)
    ff_lower = forward_fill(ff_lower)

    # Policy changes, derived from the target series rather than hardcoded.
    changes = []
    for i in range(1, len(days)):
        if ff_upper[i] is None or ff_upper[i - 1] is None:
            continue
        if abs(ff_upper[i] - ff_upper[i - 1]) > 1e-9:
            changes.append({
                "date": days[i].isoformat(),
                "from": round(ff_upper[i - 1], 4),
                "to": round(ff_upper[i], 4),
            })

    series = {}
    sp500 = build_sp500()
    for series_id, mode in [("WALCL", "step"), ("SP500", "daily"),
                            ("NASDAQCOM", "daily"), ("VIXCLS", "daily"),
                            ("THREEFYTP10", "daily")]:
        raw = sp500 if series_id == "SP500" else read_fred(series_id)
        if not raw:
            continue
        aligned = align(raw, days, step=(mode == "step"))
        series[series_id] = {
            "label": FRED_SERIES[series_id],
            "values": [None if v is None else round(v, 3) for v in aligned],
        }

    return {
        "fedFundsUpper": [None if v is None else round(v, 4) for v in ff_upper],
        "fedFundsLower": [None if v is None else round(v, 4) for v in ff_lower],
        "effr": [None if v is None else round(v, 4)
                 for v in forward_fill([effr.get(d) for d in days])],
        "policyChanges": changes,
        "series": series,
    }


def recession_ranges(first, last):
    """Recession spans as NBER publishes them, from peak month to trough month.

    FRED offers two daily variants and neither covers the whole span on its
    own: USRECDP starts at the peak but stops before the trough month, USRECD
    starts after the peak but runs to the end of the trough. The published
    dates are the union, so take the start from one and the end from the other.
    """
    def spans(series_id):
        flags = read_fred(series_id)
        out, start, prev = [], None, None
        for day in sorted(flags):
            inside = flags[day] > 0.5
            if inside and start is None:
                start = day
            elif not inside and start is not None:
                out.append((start, prev))
                start = None
            prev = day
        if start is not None:
            out.append((start, prev))
        return out

    peaks, troughs = spans("USRECDP"), spans("USRECD")
    if not peaks:
        peaks = troughs
    if not troughs:
        troughs = peaks
    if not peaks:
        return []

    merged = []
    for begin, fallback_end in peaks:
        # The matching trough span is the one that starts just after this peak.
        end = fallback_end
        for other_begin, other_end in troughs:
            if begin <= other_begin <= fallback_end + dt.timedelta(days=45):
                end = max(end, other_end)
                break
        merged.append((begin, end))

    return [
        {"start": a.isoformat(), "end": b.isoformat()}
        for a, b in merged if b >= first and a <= last
    ]


def forward_fill(values):
    out, last = [], None
    for v in values:
        if v is not None:
            last = v
        out.append(last)
    return out


def align(raw, days, step=False):
    """Map an irregular series onto the trading-day axis.

    Weekly series (the Fed balance sheet is reported each Wednesday) are held
    flat until the next reading rather than interpolated, so the reader sees
    the actual reporting cadence.
    """
    keys = sorted(raw)
    out, idx, last = [], 0, None
    for day in days:
        while idx < len(keys) and keys[idx] <= day:
            last = raw[keys[idx]]
            idx += 1
        out.append(last)
    if step:
        return out
    # Fill leading gaps for daily series so lines start where data starts.
    return out


# ---------------------------------------------------------------------------
# Monetary policy regimes and preset views
# ---------------------------------------------------------------------------
# Start and end dates of the Fed's balance sheet programs. These are matters
# of public record, taken from the FOMC's own announcements.
REGIMES = [
    ("QE1",             "2008-11-25", "2010-03-31", "ease",
     "First large-scale asset purchases: agency debt, MBS, then Treasuries."),
    ("QE2",             "2010-11-03", "2011-06-30", "ease",
     "$600bn of longer-term Treasury purchases."),
    ("Operation Twist", "2011-09-21", "2012-12-31", "twist",
     "Sold short-dated holdings to buy long-dated ones. Balance sheet flat, "
     "long end pushed down."),
    ("QE3",             "2012-09-13", "2014-10-29", "ease",
     "Open-ended monthly purchases with no announced end date."),
    ("Taper",           "2013-12-18", "2014-10-29", "taper",
     "Purchases wound down month by month after the 2013 taper tantrum."),
    ("QT1",             "2017-10-01", "2019-07-31", "tighten",
     "First balance sheet runoff. Ended early amid repo market stress."),
    ("COVID QE",        "2020-03-15", "2022-03-09", "ease",
     "The fastest balance sheet expansion on record."),
    ("QT2",             "2022-06-01", "2025-12-01", "tighten",
     "Second runoff, alongside the steepest hiking cycle since 1980."),
]

# A deliberately short list. Each one is a day where the surface visibly does
# something, so the marker earns its place; the site only draws the ones inside
# the current date range.
EVENTS = [
    ("1990-08-02", "Iraq invades Kuwait",
     "Oil doubles in three months. The Fed is already easing into a recession."),
    ("1994-02-04", "The bond massacre begins",
     "The first of six hikes in twelve months, and the first that markets had "
     "not been told about in advance."),
    ("1998-10-15", "LTCM fallout",
     "An unscheduled cut between meetings, the third that autumn, after the "
     "hedge fund's collapse froze credit markets."),
    ("2001-09-17", "Markets reopen after 11 September",
     "An emergency half-point cut on the morning trading resumed."),
    ("2002-02-15", "The 30-year bond is discontinued",
     "The last 30-year yield Treasury publishes for four years. The far edge "
     "of this surface is reconstructed from here until February 2006."),
    ("2006-02-09", "The 30-year bond returns",
     "Four years later the long bond is auctioned again and the far edge of "
     "the surface becomes measured data once more."),
    ("2007-08-16", "The credit markets freeze",
     "One-month bills fall from 5.04 to 3.13 percent in six sessions as the "
     "commercial paper market shuts. The first crack in the surface."),
    ("2008-09-17", "A money market fund breaks the buck",
     "Two days after Lehman, the 3-month bill yields 0.08 percent as cash "
     "floods into government paper at almost any price."),
    ("2008-12-16", "Zero",
     "The target becomes a range, 0 to 0.25 percent, for the first time in "
     "the Fed's history."),
    ("2011-08-08", "The US loses its AAA rating",
     "First session after the downgrade. Ten-year yields fall from 2.63 to "
     "2.25 over two days, the opposite of what a downgrade should do."),
    ("2013-05-22", "Taper tantrum",
     "Bernanke suggests purchases might slow one day. The long end jumps on "
     "no policy change at all."),
    ("2020-03-09", "The entire curve below one percent",
     "Every maturity out to thirty years yields under one percent. It had "
     "never happened before, and has not happened since."),
    ("2020-03-15", "Emergency cut to zero",
     "A Sunday evening move back to the zero bound, with $700bn of purchases "
     "announced alongside it."),
    ("2022-04-01", "Two-year yields pass ten-year",
     "The classic recession signal inverts, at the start of the steepest "
     "hiking cycle since 1980."),
    ("2023-03-13", "Silicon Valley Bank fails",
     "The 2-year yield drops 0.57 points in one session, the largest single-day "
     "fall anywhere in this record, and 1.02 points in three."),
    ("2023-04-20", "The debt ceiling scare begins",
     "One-month bills yield 1.74 points LESS than three-month bills. Paper "
     "maturing before the deadline is precious, so its yield collapses. Over "
     "the next five weeks that relationship turns inside out."),
    ("2023-05-04", "The deadline crosses the one-month window",
     "The 1-month yield jumps 1.06 points in a single day, the largest move "
     "in this record. That morning's four-week bill matured on 6 June, days "
     "past the point Treasury said the cash ran out, and sold at 5.84 percent"
     ". The week before, one maturing 30 May had gone at 3.83."),
    ("2023-05-11", "One month costs more than two",
     "The 1-month closes a full point above the 2-month, the widest such "
     "inversion on record. Treasury sold four-week bills maturing 13 June at "
     "5.61 percent that morning, and eight-week bills maturing 11 July at "
     "4.68: twice the loan for a point less, to come due clear of the danger."),
    ("2023-05-23", "Nowhere near a deal",
     "Nine days from the deadline and House Republicans say no agreement is "
     "close. The dislocation holds, with June paper still yielding far more "
     "than July paper."),
    ("2023-05-26", "The most expensive four weeks on record",
     "The 1-month reaches 6.02 percent, the highest ever published, to lend "
     "to the United States for four weeks. An agreement in principle lands "
     "over the weekend and the spike is gone within three sessions."),
]

# The opening view. Deliberately a rolling window rather than fixed dates: the
# first thing a visitor should see is what the curve is doing now, on a site
# that updates every evening. Five years rather than three or four because it
# still reaches back to the zero floor of 2021, so the whole arc from nothing
# to six percent and back is on screen at once.
DEFAULT_YEARS = 5

PRESETS = [
    ("Everything",              "1990-01-02", None,
     "Every trading day the Treasury has published a full daily curve."),
    ("Early 90s easing",        "1990-01-02", "1994-02-01",
     "Recession, then a slow grind down to 3%. The curve steepens dramatically."),
    ("1994 bond massacre",      "1993-10-01", "1995-06-30",
     "Six surprise hikes in twelve months. Watch the whole surface lift at once."),
    ("Dot-com bust",            "2000-01-03", "2004-06-30",
     "From an inverted curve to 1% funds. The short end falls off a cliff."),
    ("Greenspan's conundrum",   "2004-06-01", "2006-08-31",
     "Seventeen consecutive hikes, and the long end refuses to follow."),
    ("Global financial crisis", "2007-06-01", "2009-12-31",
     "Inversion, then collapse to zero. The single most dramatic stretch."),
    ("QE1",                     "2008-09-01", "2010-06-30",
     "The front edge pins to zero while the long end is pulled down behind it."),
    ("QE2 and Twist",           "2010-08-01", "2013-01-31",
     "Twist is the interesting one: the balance sheet stays flat and the long "
     "end still falls."),
    ("QE3 and the tantrum",     "2012-06-01", "2015-01-31",
     "May 2013: the long end snaps upward on nothing but a hint of tapering."),
    ("Liftoff and hiking",      "2015-11-01", "2019-08-31",
     "Zero to 2.5%, and the curve flattens the whole way up."),
    ("COVID",                   "2020-01-02", "2021-12-31",
     "Back to zero in three weeks, and the balance sheet nearly doubles."),
    ("Inflation shock",         "2021-09-01", "2023-12-29",
     "The steepest hiking cycle since Volcker. Deep, prolonged inversion."),
    ("Cuts and steepening",     "2024-01-02", None,
     "The inversion unwinds from the front end."),
]


def build_meta(days):
    first, last = days[0].isoformat(), days[-1].isoformat()

    # Recomputed on every build, so the opening view never goes stale.
    window_start = days[-1].replace(year=days[-1].year - DEFAULT_YEARS)
    rolling = ("Past five years", max(days[0], window_start).isoformat(), last,
               "Zero to six percent and most of the way back, in the time it "
               "takes to forget that money was ever free.")
    events = [
        {"date": d, "title": t, "note": n}
        for d, t, n in EVENTS if first <= d <= last
    ]
    regimes = [
        {"name": n, "start": s, "end": e, "kind": k, "note": note}
        for n, s, e, k, note in REGIMES
    ]
    presets = [
        {"name": n, "start": s, "end": e or last, "note": note}
        for n, s, e, note in [rolling] + PRESETS
    ]
    return regimes, presets, events, first, last


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    today = date.today()
    print("Syncing sources (cached files are not re-downloaded)")
    refreshed = sync_treasury(today)
    sync_fred(today)

    print("Reading cached data")
    curves = read_treasury()
    if not curves:
        sys.exit("No Treasury data found. Check the download step above.")

    # Overnight anchor for filling the short end before 1-month bills existed.
    effr = read_fred("EFFR")
    target_old = read_fred("DFEDTAR")
    upper, lower = read_fred("DFEDTARU"), read_fred("DFEDTARL")
    fed_anchor = {}
    for day in curves:
        if day in effr:
            fed_anchor[day] = effr[day]
        elif day in upper and day in lower:
            fed_anchor[day] = (upper[day] + lower[day]) / 2
        elif day in target_old:
            fed_anchor[day] = target_old[day]

    print("Building surface")
    days, grid_m, blob, tenor_blob, real_lo, real_hi = build_surface(curves, fed_anchor)

    print("Building context series")
    context = build_context(days)
    regimes, presets, events, first, last = build_meta(days)
    recessions = recession_ranges(days[0], days[-1])
    print(f"  {len(recessions)} recessions, {len(events)} marked events")

    os.makedirs(OUT, exist_ok=True)

    with open(os.path.join(OUT, "surface.bin"), "wb") as fh:
        fh.write(blob)

    with open(os.path.join(OUT, "tenors.bin"), "wb") as fh:
        fh.write(tenor_blob)

    context_text = json.dumps(context, separators=(",", ":"))

    # A fingerprint of the payload, used to keep the four data files in step in
    # the browser cache. Derived from the content rather than the clock, so an
    # unchanged build still produces an identical file and no pointless commit.
    version = hashlib.sha256(
        blob + tenor_blob + context_text.encode("utf-8")
    ).hexdigest()[:10]

    manifest = {
        "version": version,
        "firstDate": first,
        "lastDate": last,
        "dayCount": len(days),
        "gridCount": GRID_N,
        "warp": WARP,
        "maturities": [round(m, 6) for m in grid_m],
        "tenorYears": [round(m, 6) for m in TENOR_YEARS],
        "tenorLabels": [label for label, _ in TENORS],
        "scale": SCALE,
        "offset": OFFSET,
        "dates": [d.isoformat() for d in days],
        "realLow": real_lo,
        "realHigh": real_hi,
        "regimes": regimes,
        "presets": presets,
        "recessions": recessions,
        "events": events,
        "sources": {
            "yields": "US Department of the Treasury, daily par yield curve rates",
            "policy": "Federal Reserve Board via FRED (DFEDTAR, DFEDTARU/L, EFFR)",
            "balanceSheet": "Federal Reserve Board via FRED (WALCL)",
            "markets": "S&P 500 from the supplied workbook spliced to FRED; "
                       "NASDAQ, VIX and term premium from FRED",
            "recessions": "NBER via FRED (USRECDP and USRECD)",
        },
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, separators=(",", ":"))

    with open(os.path.join(OUT, "context.json"), "w", encoding="utf-8") as fh:
        fh.write(context_text)

    try:
        import build_preview
        build_preview.main()
    except Exception as exc:                       # a card is not worth failing over
        print(f"  ! preview card not rendered: {exc}")

    if not refreshed:
        behind = (today - days[-1]).days
        print(f"\n  ! Could not reach Treasury. Newest data is {days[-1]} "
              f"({behind} days old).")
        if behind > 10:
            raise SystemExit(
                "Data is more than ten days stale and Treasury is unreachable. "
                "Failing so this is noticed rather than quietly serving old "
                "numbers.")

    size = len(blob) / 1024
    print(f"  tenors.bin    {len(tenor_blob) / 1024:,.0f} KB")
    print(f"\nDone. {len(days):,} trading days, {first} to {last}")
    print(f"  surface.bin   {size:,.0f} KB")
    for name in ("manifest.json", "context.json"):
        kb = os.path.getsize(os.path.join(OUT, name)) / 1024
        print(f"  {name:<14}{kb:,.0f} KB")


if __name__ == "__main__":
    main()
