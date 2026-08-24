# The Shape of Money

An interactive 3D view of every US Treasury yield curve since 1990, with the
Fed funds target along the front edge, a choice of series on the back wall,
recessions falling across the surface as shade, and the Fed's QE and QT
programs marked on the floor.

Live at **[yieldcurve3d.com](https://yieldcurve3d.com)**.

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
  2s10s and 10y-3m, whatever is on the back wall, and whether the day sits
  inside a recession or a Fed program. Click to pin it. Escape clears it.
- **Put something behind the surface**: the Fed balance sheet, the S&P 500 back
  to 1990, the NASDAQ, the VIX, or the 10-year term premium.
- **Share the exact view.** Every control writes to the URL, so a link restores
  the dates, the height mode, the back wall, the camera and the theme.
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
| `.github/workflows/` | The robot that keeps the data current. |

---

## Putting it online

You need a free GitHub account. Nothing else, and no payment method.

**1. Make a repository.** Go to <https://github.com/new>. Give it a name such
as `yield-curve`. Choose **Public** (private repositories don't get free
Pages hosting). Don't tick any of the "initialize" boxes. Click
**Create repository**.

**2. Upload this folder.** On the empty repository page, click
**uploading an existing file**, then drag the whole `yield-curve-3d` folder
into the browser window. GitHub keeps the folder structure. Wait for the
upload to finish, then click **Commit changes**.

> The upload page silently skips folders that start with a dot, which would
> leave out `.github`. If the Actions tab is empty afterwards, see
> *Installing the updater by hand* below.

**3. Turn on the website.** In your repository, go to **Settings** →
**Pages**. Under "Build and deployment", set Source to **Deploy from a
branch**, then set the branch to **main** and the folder to **/docs**.
Click **Save**.

Wait two or three minutes, then reload that page. It will show your address:

```
https://YOUR-USERNAME.github.io/yield-curve/
```

That's the site. Send that link to anyone.

**4. Let the robot write.** Go to **Settings** → **Actions** → **General**,
scroll to "Workflow permissions", choose **Read and write permissions**, and
Save. Without this the daily update can fetch data but can't save it.

**5. Test the updater.** Go to the **Actions** tab, click **Update data**, then
**Run workflow**. It should finish green in under a minute. From then on it
runs by itself every weekday evening.

### What the updater actually does

It runs at 22:30 UTC Monday to Friday, which is after Treasury has posted the
day's curve. Each run:

1. Downloads only the current year's Treasury file. The other 36 years are
   already in `data/raw/treasury/` and are never fetched again.
2. Refreshes a FRED series only if the local copy is more than a few days old.
   On a typical run every one of them is skipped.
3. Rebuilds `docs/data/` and redraws the social preview card.
4. Commits **only if something changed.** The build is deterministic, so a day
   with no new data produces byte-identical files and no commit.

Both the raw downloads and the rebuilt files are committed, so the repository
is the archive. Nothing depends on an outside service staying up: if Treasury
or FRED is unreachable, the run keeps the cached copy and carries on.

You do not need to do anything after the one-time setup above.

**Two things worth knowing.** GitHub switches off scheduled workflows in
repositories with no activity for 60 days. This one commits on most trading
days, so the clock keeps resetting, but if the job ever breaks and stays broken
you would eventually get an email saying it was disabled; re-enabling it is one
button in the Actions tab. And if Treasury ever adds a maturity, as they did
with the 1.5-month in 2025, the run prints a warning naming the new column and
carries on without it, rather than silently dropping data.

### Installing the updater by hand

If the Actions tab has nothing in it, the `.github` folder didn't upload. Fix
it in the browser: click **Add file** → **Create new file**, type
`.github/workflows/update-data.yml` as the filename, paste in the contents of
that file from this folder, and commit.

---

## Pointing yieldcurve3d.com at it

Do this **after** the site is working at the github.io address, not before.
Pointing a domain at GitHub before the site exists just gives you a broken page
and no way to tell which step went wrong.

At your registrar's DNS settings, add these four **A** records for the bare
domain (host `@`):

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Then one **CNAME** record, host `www`, pointing at `YOUR-USERNAME.github.io`
(note the trailing dot if your registrar wants one).

Then in the repository, **Settings** → **Pages** → **Custom domain**, type
`yieldcurve3d.com` and press Save. GitHub writes a `CNAME` file into `docs/`
for you, which adds a commit you will want to pull down in GitHub Desktop
before making further changes.

Once the DNS has propagated — usually minutes, occasionally a day — tick
**Enforce HTTPS**. GitHub issues the certificate free.

---

## Running it on your own computer

The page loads its data by fetching files, and browsers block that for files
opened directly from disk. So it needs a local web server. Python has one
built in:

```bash
cd yield-curve-3d/docs && python3 -m http.server 8777
```

Then open <http://localhost:8777> . Press Ctrl+C in the terminal to stop.

To refresh the data yourself:

```bash
cd yield-curve-3d && python3 pipeline/build_data.py
```

It only downloads what it doesn't already have. A run with nothing new takes a
couple of seconds; the very first run takes about a minute.

---

## A single-file copy

There is also a version that packs the whole thing - code, graphics library and
all 36 years of data - into one HTML file:

```bash
cd yield-curve-3d && python3 pipeline/build_standalone.py
```

It writes `dist/shape-of-money.html`, about 4.6 MB. That file needs no server
and no internet connection. Double-click it, put it on a USB stick, or email
it to someone. Rebuild it whenever you want a fresh copy of the data.

The hosted site is the better option for anything public, because it updates
itself. This is for sending to one person.

---

## How the data is put together

**Yields.** The US Treasury publishes a daily par yield curve. The pipeline
saves one CSV per year under `data/raw/treasury/`. Finished years never change,
so they are downloaded once and then read from disk forever. Only the current
year is re-fetched.

**Everything else** comes from FRED, the St. Louis Fed's data service: the Fed
funds target (`DFEDTAR`, `DFEDTARU`, `DFEDTARL`), the effective rate (`EFFR`),
the balance sheet (`WALCL`), the NBER recession indicator (`USRECD`), the
10-year term premium (`THREEFYTP10`), and the market series. These are only
re-downloaded when the local copy is more than a few days stale. No API key is
needed.

**The S&P 500** is in two halves. FRED only carries the last ten years, so the
deep history comes from the spreadsheet in `data/raw/sp500-1982-2021.xlsx`
(daily closes, 1982 to March 2021) and FRED extends it to the present. The two
sources overlap by 1,147 trading days and agree to an average of 0.0012 index
points, so the join is invisible. The pipeline reads the spreadsheet with the
standard library — an `.xlsx` is a zip of XML — and checks that the column it
reads really is headed "Close" rather than trusting its position.

### Filling the gaps

The Treasury has added and dropped maturities over the years, which would leave
holes in the surface:

| Maturity | Missing |
|---|---|
| 1 month | before 31 July 2001 |
| 1.5 / 2 / 4 month | before 2025 / Oct 2018 / Oct 2022 |
| 20 year | 1990 to Sept 1993 |
| **30 year** | **Feb 2002 to Feb 2006** — the bond wasn't issued |

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
them is a real market event — the August 2007 credit freeze, the week Lehman
failed, and the April 2023 debt-ceiling scare, when one-month bills briefly
yielded almost two points less than three-month bills.

### Recessions, QE bands and events

Three different things want to mark the same time axis, so each uses a
different visual channel and they can all be read at once:

- **Recessions** dim the surface, like a cloud shadow crossing it, and dim the
  back-wall series with it. They also get a narrow rail in their own lane past
  the back wall, for reading exact start and end dates. Because they work in
  lightness, they never fight the QE bands for color.
- **QE and QT programs** are colored bands across the floor, blue for
  easing, red for tightening, with a brighter rule at each start date.
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

## Changing things

**Change the opening view.** `DEFAULT_YEARS` at the top of the `PRESETS`
section in `pipeline/build_data.py`. It is a rolling window recomputed on every
build, so the first thing a visitor sees is always current. Five was chosen
over four because it still reaches the zero floor of 2021: a five-year window
spans 0.01 to 6.02 percent, where four years starts at 2.82 and misses the
climb entirely. Worth revisiting once 2021 falls out of range.

**Add a period to the buttons.** Open `pipeline/build_data.py`, find the
`PRESETS` list, add a line in the same shape as the others, and re-run the
script. Same for `REGIMES`, which draws the colored bands on the floor, and
`EVENTS`, which places the markers.

**Change the light or dark palette.** `docs/js/theme.js`. Every color the page
and the 3D scene use is defined there once, in one object per theme.

**Change the colors.** `docs/js/colormap.js`, the `STOPS` list at the top.

**Change the page's look.** `docs/style.css`. The colors are all defined at
the very top.

**Change how wide or deep the box is.** `BOX` at the top of `docs/js/scene.js`.

---

## If this site ever makes money, read this first

Two things are fine for a free, non-commercial site and stop being fine the day
there is revenue:

- **S&P 500 index values** belong to S&P Dow Jones Indices, who license display
  rights commercially. The deep history here also came from a Yahoo Finance
  download, whose terms bar commercial redistribution.
- Nothing else in the project has any licensing exposure. Treasury and Federal
  Reserve data are US government works, NBER recession dates are published
  facts, and three.js is MIT.

The fix is one line in each of two files, and it is marked in both:
drop `"SP500"` from the series list in `pipeline/build_data.py` and its
`<option>` from `docs/index.html`. Nothing depends on it. The NASDAQ Composite
runs from 1971 and the VIX starts on 2 January 1990, the same day the yield
curve does, so the back wall keeps working either way.

This is a note about where the risk sits, not legal advice.

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
surface measured against the Fed funds rate, because quantitative easing is
close to invisible on a plain yield surface and obvious on that one. It assumes
no knowledge of bonds throughout.

It runs once, remembers that in the browser, and the question mark in the top
corner replays it. Embedded copies never show it.

The claim in the inversion step was checked against the data rather than
repeated from folklore. All four recessions in this record were preceded by a
2-year/10-year inversion, between five and twenty-four months ahead. But 571 of
the 1,052 inverted days had no recession within two years of them, almost all
from the long inversion of 2022 to 2024, so the step says that too.

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

`docs/preview.png` is what X, Slack, iMessage and the rest show when the link is
shared. It is drawn from the same data the site loads, by
`pipeline/build_preview.py`, and redrawn on every update, so a shared link
always shows the current surface rather than a stale screenshot.

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
separately, so their windows drift apart — enough that a returning visitor
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

## Costs

Nothing. GitHub Pages is free for public repositories, and Actions minutes are
free too. A domain name is optional.

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

The code here is MIT licensed — see `LICENSE`. It is original work; it is not
derived from any other visualization. three.js is bundled under its own MIT
license (`docs/vendor/THREE-LICENSE.txt`), which requires that the license file
stays with it.
