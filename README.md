# The Shape of Money

An interactive 3D view of every US Treasury yield curve since 1990, with the
Fed funds target along the front edge, a choice of series on the back wall,
recessions falling across the surface as shade, and the Fed's QE and QT
programs marked on the floor.

Live at **[yieldcurve3d.com](https://yieldcurve3d.com)**.

![US Treasury yields from 2021 to 2026 drawn as a 3D surface. Time runs left to
right, maturity recedes from one month at the front edge to thirty years at the
back, and height is the yield. The near-zero blue trough of 2021 climbs into
the yellow-green plateau of the hiking cycle and stays there. An orange ribbon
along the front edge is the Fed funds target, stepping up through 2022 and back
down from 2024. A pale blue sheet floats through the surface at the rate of
consumer price inflation, so the stretch of surface below it is where lending
lost money in real terms. Colored bands on the floor mark COVID-era bond buying
and the selling that followed. The readout is pinned on 1 July 2024, the day
the Sahm rule
triggered.](docs/preview.png)

It runs entirely in the browser. Visitors need nothing installed. Hosting costs
nothing.

## What you can do with it

- **Change what the height means.** *Yield* is the plain view. *Yield minus Fed
  funds* is where QE becomes obvious: the front edge pins to zero while
  everything behind it is dragged down. *Yield minus 3-month* turns the whole
  surface into curve slope, where anything below the zero plane is an
  inversion. The spread views switch to a diverging color scale so the sign
  change is visible.
- **Read a whole day at once.** Move the pointer across the scene and the
  readout gives you every tenor Treasury published that day, the policy rate,
  2s10s and 10y-3m, CPI inflation and the 10-year yield after it, whatever is
  on the back wall, and whether the day sits inside a recession or a Fed
  program. Event markers include the days the Sahm rule crossed its
  threshold. The same curve is drawn beside the numbers, so the figures have a
  shape. Click to pin it. Escape clears it.
- **Play the window.** Press Play and a cursor walks the trading days in the
  current range, redrawing the readout as it goes. The range itself does not
  move. Dragging the slider, picking a preset, rotating the scene or pressing
  Escape all stop it.
- **Jump to a date.** Type one and it snaps to the nearest trading day. If the
  day sits outside the current window, the window slides to contain it and
  keeps its span rather than expanding to all of history.
- **Put something behind the surface**: the Fed balance sheet, the S&P 500 back
  to 1990, the NASDAQ, the VIX, the 10-year term premium, expected inflation
  from the 10-year breakeven, M2 growth, or the unemployment rate. It starts
  empty. Inflation as the sea level and unemployment on the wall puts both
  halves of the Fed's mandate on screen together.
- **Share the exact view.** Every control writes to the URL, so a link restores
  the dates, the height mode, the back wall, the camera, the theme, the chosen
  maturities and the pinned day. A link can therefore open on a particular
  date with its figures already on screen. Playing is deliberately not in the
  URL: it is something you do, not a view.
- **Choose the maturities.** Switch any of the fourteen tenors off and the
  curve is re-interpolated through the ones that are left, so the surface stays
  continuous rather than developing holes, and the maturity axis re-lays itself
  to the range you kept. Two is the minimum.
- **Take the picture.** Download, copy, open in a new tab, print, or share on
  X. The image is recomposited with the axis labels, the sources and a
  `yieldcurve3d.com` watermark, at twice screen resolution.

| | |
|---|---|
| `⌥⌘S` | Download image |
| `⇧⌘S` | Copy image |
| `⌥S` | Copy link |
| `⌘P` | Print |
| `Esc` | Clear the pinned date |

The date slider has three grips: the two ends change the range, and the bar
between them slides the whole window without changing its length, which is how
you walk a fixed span forward through history.

---

## What's in here

| Folder | What it is |
|---|---|
| `docs/` | **The website.** This is the folder GitHub publishes. |
| `docs/data/` | The prepared dataset the page loads (about 1.4 MB total). |
| `docs/vendor/` | three.js, the 3D graphics library. Bundled so the site has no outside dependencies. |
| `pipeline/build_data.py` | Downloads new data and rebuilds `docs/data/`. |
| `pipeline/build_standalone.py` | Optional: packs the whole site into one shareable file. |
| `pipeline/build_preview.py` | Draws `docs/preview.png`, the image social sites show. |
| `data/raw/` | Cached original downloads. Once a year is saved here it is never fetched again. |
| `analysis/` | The statistics behind `notes/methods.md`. Standard library only, so the arithmetic can be read rather than trusted. |
| `notes/` | Working notes: the methods write-up, and my own deployment and video notes. |
| `.github/workflows/` | The robot that keeps the data current. |

---

## Run it locally

Python 3 and a browser. Nothing to install, no pip, no npm. Built and run on
3.14, and stdlib-only so anything reasonably current will do.

```bash
git clone https://github.com/eric714/yield-curve-3d
cd yield-curve-3d
python3 pipeline/serve.py
```

Then open <http://localhost:8000>. That server is Python's own with caching
turned off, because the browser will otherwise hold on to an edited module and
you end up drawing conclusions from code that is no longer running. Pass a port
if 8000 is taken: `python3 pipeline/serve.py 8080`.

The repository ships with the data already built, so the site works straight
after cloning. To pull anything new that Treasury and FRED have published since:

```bash
python3 pipeline/build_data.py
```

Finished years are cached under `data/raw/` and never re-fetched, so this is
mostly a no-op that checks the current year. It rewrites `docs/data/` and only
produces a diff when the numbers actually changed.

## How the data is put together

**Yields.** The US Treasury publishes a daily par yield curve. The pipeline
saves one CSV per year under `data/raw/treasury/`. Finished years never change,
so they are downloaded once and then read from disk forever. Only the current
year is re-fetched.

**Everything else** comes from FRED, the St. Louis Fed's data service: the Fed
funds target (`DFEDTAR`, `DFEDTARU`, `DFEDTARL`), the effective rate (`EFFR`),
the balance sheet (`WALCL`), the NBER recession indicator (`USRECD`), the
10-year term premium (`THREEFYTP10`), the unemployment rate (`UNRATE`), and
the market series. These are only re-downloaded when the local copy is more
than a few days stale. No API key is needed.

**The Sahm rule** is computed rather than downloaded: the three-month average
unemployment rate less its own lowest three-month average of the previous
twelve months, marked wherever that gap crosses 0.50. Because it is derived
from the current vintage of `UNRATE`, and that series is revised, these dates
are not necessarily the ones that would have been published at the time. It is
a coincident indicator rather than a leading one: on the occasions it has been
right, the recession had already started.

**The S&P 500** is in two halves. FRED only carries the last ten years, so the
deep history comes from the spreadsheet in `data/raw/sp500-1982-2021.xlsx`
(daily closes, 1982 to March 2021) and FRED extends it to the present. The two
sources overlap by 1,147 trading days and agree to an average of 0.0012 index
points, so the join is invisible. The pipeline reads the spreadsheet with the
standard library (an `.xlsx` is a zip of XML) and checks that the column it
reads really is headed "Close" rather than trusting its position.

### Filling the gaps

The Treasury has added and dropped maturities over the years, which would leave
holes in the surface:

| Maturity | Missing |
|---|---|
| 1 month | before 31 July 2001 |
| 1.5 / 2 / 4 month | before 2025 / Oct 2018 / Oct 2022 |
| 20 year | 1990 to Sept 1993 |
| **30 year** | **Feb 2002 to Feb 2006.** the bond wasn't issued |

Three different repairs, because the gaps aren't the same kind of problem:

1. **Gaps between two published maturities** are filled with monotone cubic
   interpolation across that day's curve. Monotone matters: an ordinary spline
   overshoots and invents humps that were never in the data.

2. **The 30-year hole** sits at the outer edge, so there is nothing beyond it
   to interpolate across. Instead the pipeline takes the gap between the
   30-year and 20-year yields, interpolates *that* across the four missing
   years, and adds it back to the published 20-year.

3. **The short end before 2001** is anchored with the Fed funds target rate,
   which is effectively the yield at zero maturity. That turns an extrapolation
   off the end of the curve into an interpolation between two real numbers.

Everything reconstructed this way is shaded paler on the surface, and the
hover readout says so explicitly. You can turn the shading off under **Show**.

The result is checked for artifacts: across roughly 440,000 grid points there
are 54 single-day spikes and 5 kinks along the maturity axis, and every one of
them is a real market event, the August 2007 credit freeze, the week Lehman
failed, and the April 2023 debt-ceiling scare, when one-month bills briefly
yielded almost two points less than three-month bills.

### Recessions, QE bands and events

Three different things want to mark the same time axis, so each uses a
different visual channel and they can all be read at once:

- **Recessions** dim the surface, like a cloud shadow crossing it, and dim the
  back-wall series with it. The bands run from the NBER peak month to the
  trough month, which needs two of FRED's daily series: `USRECDP` starts at the
  peak but stops before the trough, `USRECD` starts after the peak but runs to
  the end of it. Either one alone puts a band a month out from the dates NBER
  publishes, so the pipeline takes the start from the first and the end from
  the second. They also get a narrow rail in their own lane past
  the back wall, for reading exact start and end dates. Because they work in
  lightness, they never fight the QE bands for color.
- **QE and QT programs** are colored bands across the floor, blue for
  easing, red for tightening, with a brighter rule at each start date.
- **Inflation as sea level** is a translucent sheet at the height of the
  inflation rate, spanning every maturity because inflation applies to all of
  them equally. Where the surface rises above it a lender beat inflation; where
  the surface is submerged, they did not, and the gap is the real yield read
  directly rather than worked out. It is the one series that can share the
  vertical axis honestly, since it is already measured in the same units as a
  yield. Off by default: it is a second reading of the chart, and switching it
  on widens the axis, because CPI reached minus two per cent in 2009 and
  clipping that would hide the best real return in the record.
- **Events** are markers only, never text. Twenty days where the surface
  visibly does something get a small diamond in the margin; the words appear
  in the readout when the date cursor reaches one, and in the sidebar list,
  which you can click to jump. That keeps a 36-year view from turning into a
  wall of annotations. Markers that would land on the same pixel merge into
  one slightly larger diamond rather than stacking up.

Every claim attached to an event was checked against the data before it went
in. Two dates moved as a result: the AAA downgrade marker sits on 8 August
2011, the first session after the Friday-evening announcement, because yields
actually rose on the day itself; and the SVB marker sits on 13 March 2023,
which is the largest single-day fall in the 2-year yield anywhere in this
record, rather than the 10th.

The five markers across April and May 2023 tell one story in sequence, and the
numbers in them come from Treasury's own auction results
(`api.fiscaldata.treasury.gov`) rather than from news coverage. The mechanism
is worth knowing: the 1-month yield is derived from bills maturing about four
weeks out, so as that window slid forward it crossed the date Treasury said
the cash would run out, and the yield on those particular bills jumped while
bills maturing safely past the danger got *cheaper*. On 11 May the four-week
auction cleared at 5.61 percent and the eight-week at 4.68: twice the loan
for a point less.

---

## About the S&P 500

S&P 500 index values are the intellectual property of S&P Dow Jones Indices,
which is why the free feed is capped at ten years. The deep history here comes
from a file you supplied. That is fine for a personal project, but if the site
ever becomes commercial, or if S&P ask, the honest fix is to switch the default
back wall to the NASDAQ Composite (free, back to 1971) or the VIX (free, and it
starts on 2 January 1990, the very same day the Treasury's daily curve does).
Both are already in the dropdown, so it is a one-line change.

Treasury and Federal Reserve data are US government works and carry no
copyright. NBER recession dates are published facts.

---

## The walkthrough

First-time visitors get a ten-step tour that drives the chart while it explains
it, on the principle that showing beats telling. It turns the surface end-on so
a single day is unmistakable, swings it side-on so time stacking up is obvious,
and jumps to 2022 to show an inverted curve rather than describing one.

The first five steps teach the chart; the rest teach the panel. Each control
step rings the section it is talking about and puts the chart into a state
where that control matters: the height step drops you into 2008 with the
surface measured against the Fed funds rate, which turns the flat plane into
the Fed itself and shows how far the market had already moved away from it. In
2007, 95% of the published curve sat below the policy rate months before the
first cut. It assumes no knowledge of bonds throughout.

It runs once, remembers that in the browser, and the question mark in the top
corner replays it. Embedded copies never show it.

The claim in the inversion step was checked against the data rather than
repeated from folklore, and the check is why the step is narrower than the
folklore. Two of the four recessions here were preceded by a long 2-year/10-year
inversion: 227 inverted days before 2001 and 238 before 2008. The other two were
not, in any meaningful sense. The record opens in January 1990 and so misses most
of the 1989 inversion, leaving 16 days before the 1990 recession; 2020 was
preceded by 3. And 568 of the 1,052 inverted days in the record had no recession
within two years of them, 539 of those from the long inversion of 2022 to 2024.
So the step claims the two it can support and says the 2022 inversion broke the
pattern.

## What the site opens with

Nothing but the surface. The Fed funds ribbon, the QE and QT bands, the
recession shading, the event markers, the individual curve lines, the sea level
sheet and the back wall all start switched off. A first-time visitor meets one
surface and one idea, and every layer after that is a question they chose to
ask. The walkthrough switches them on as it explains them, so the chart builds
up rather than needing to be stripped back.

The legend lists whatever is currently drawn and nothing that is not, so any
color on screen is accounted for somewhere.

## Embedding it somewhere else

Add `?embed=1` to the address and the page strips back to the chart alone: no
side panel, a small credit link back to the site, and the reader can still
rotate, zoom and read any day. The view still comes from the URL, so whoever
embeds it chooses the period and the reader stays on that story rather than
wandering off it.

The **Copy embed code** item in the snapshot menu writes the snippet for
whatever is on screen:

```html
<iframe src="https://yieldcurve3d.com/?embed=1#from=2007-06-01&to=2009-12-31&m=vsFunds"
        width="100%" height="560" style="border:0;border-radius:8px"
        loading="lazy" title="The Shape of Money" allowfullscreen></iframe>
```

GitHub Pages sets no framing restrictions, so this works on any site.

One detail worth knowing if you embed it low down a long page: browsers do not
schedule animation frames for an iframe that is scrolled out of view. The chart
therefore draws its first frame immediately on load rather than waiting for the
animation loop, so it is already there when the reader arrives instead of
appearing blank until they scroll to it.

## The social preview

`docs/preview.png` is what X, Slack, iMessage and the rest show when the link
is shared, and it is also the image at the top of this file. It is a screenshot,
replaced by hand.

It used to be drawn from the data on every update by `pipeline/build_preview.py`,
so that a shared link always showed the current surface. That script still works
and is still here, but it is no longer wired into the pipeline. Across a
36-year surface, a few more months at the right edge is invisible at card size,
and a card's job is to make someone click rather than to report a number. A
screenshot does that better. If you want the generated card back, call
`build_preview.main()` from `build_data.py` again and add `docs/preview.png`
back to the `git add` line in the workflow.

That script writes a PNG with nothing but the standard library: a PNG is a few
chunks around zlib-compressed scanlines, and a shaded surface is a
painter's-algorithm fill over projected quads. It takes about two tenths of a
second. The framing is measured from the projected geometry rather than tuned
by hand, so the card stays well composed as the data grows.

## Phones and tablets

It works on both. Touch is confirmed: one finger orbits, two fingers pinch to
zoom, and a tap pins the readout. There is no hover on a touchscreen, so on a
phone the readout appears when you tap the surface rather than following your
finger, and tapping again dismisses it.

The layout stacks below about 820px wide: chart on top, controls beneath.
The readout becomes a bottom sheet across the full width with the maturities in
three columns, and the legend starts collapsed so it does not eat a small
canvas. A tablet in landscape gets the full desktop layout.

If a device has no WebGL at all, the page says so in plain language instead of
failing with a stack trace.

## Cache consistency

GitHub Pages tells browsers to hold every file for ten minutes, and each file's
ten minutes starts when that file was served. The four data files are fetched
separately, so their windows drift apart, enough that a returning visitor
could get a fresh `manifest.json` describing a stale `surface.bin`. That
mismatch used to be fatal: the loader checks that the row counts agree and
threw if they did not.

The manifest now carries a `version`, a fingerprint of the other three files'
contents, and those three are requested with it attached. Whatever the manifest
says, you get the matching data: a consistently old set or a consistently new
one, never a mixture. The fingerprint comes from the content rather than the
clock, so an unchanged build still produces identical files and no needless
commit. If a proxy or an extension manages to serve a mismatch anyway, the
loader clears the cache and retries once instead of dying.

## Traffic

The live site counts page views with GoatCounter, because I want to know
whether anyone uses it. It sets no cookies and stores nothing in the visitor's
browser, records no personal identifiers, and is switched off inside embeds and
on localhost. The dashboard is private. The script is pinned to a versioned URL
with an integrity hash. The only other outbound host is twitter.com, and only if
someone clicks Share on X. Local storage holds two things, both the visitor's
own: the theme they picked and whether they have seen the walkthrough.

## Does any of it predict anything?

People ask this immediately, so [`notes/methods.md`](notes/methods.md) answers
it properly. The headline:

- **It tells you what the bond market expects the Fed to do**, and the market
  is well calibrated at that, its implied forecast has tracked the Fed's
  actual moves close to one-for-one over 36 years. That is the one real
  forecast in the chart, and it is readable straight off the surface.
- **It tells you nothing usable about the stock market.** The slope explains
  under 1% of the S&P's next twelve months, and buying after an inversion did
  slightly *worse* than buying at random.
- **Money supply growth leads inflation** by about a year, and that survives
  dropping the 2020s entirely.
- **Both famous recession alarms failed in this cycle.** the curve, which
  warns early and often wrongly, and the Sahm rule, which has never once warned
  in advance.

The note is equally clear that the Fed result is close to circular, a 2-year
yield largely *is* the market's forecast of Fed policy, and that none of this
is new. It replicates established work, with the arithmetic shown in
[`analysis/`](analysis/) rather than taken on trust. It was reviewed twice by
people who had not seen it, and their corrections are in the history.

## Disclaimer

Shown on the site itself, and repeated here:

> **About the data.** This is an educational visualization of US Treasury yield
> data. While we try to present the data accurately, errors, delays, missing
> data or visualization artifacts may occur. Always verify important
> information with the original data source.
>
> **For educational and informational purposes only. Not investment advice.**
> No warranty of any kind is given, express or implied, as to accuracy,
> completeness or fitness for any purpose.

## Name

"The Shape of Money" is original to this project. It is not borrowed from the
New York Times piece that inspired the idea, from any repository, or from
anywhere else. Nothing here is derived from another visualization: the only
third-party code in the project is three.js, in `docs/vendor/`, under its own
MIT license.

## License

The code here is MIT licensed, see `LICENSE`. It is original work; it is not
derived from any other visualization.

Two things are borrowed and both keep their own notice. three.js is bundled
under its MIT license (`docs/vendor/THREE-LICENSE.txt`). The turtle and rabbit
on the playback speed buttons are from [Lucide](https://lucide.dev) under the
ISC license (`docs/vendor/LUCIDE-LICENSE.txt`), inlined as SVG rather than
pulled from a CDN so the page still has no outside dependencies. Both licenses
require only that the notice travels with the code, which is why the files are
in the repository and linked from the About panel on the site.
