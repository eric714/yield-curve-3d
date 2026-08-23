# The Shape of Money

An interactive 3D view of every US Treasury yield curve since 1990, with the
Fed funds target along the front edge, a choice of series on the back wall,
recessions falling across the surface as shade, and the Fed's QE and QT
programmes marked on the floor.

Live at **[yieldcurve3d.com](https://yieldcurve3d.com)**.

It runs entirely in the browser. Visitors need nothing installed. Hosting costs
nothing.

## What you can do with it

- **Change what the height means.** *Yield* is the plain view. *Yield minus Fed
  funds* is where QE becomes obvious: the front edge pins to zero while
  everything behind it is dragged down. *Yield minus 3-month* turns the whole
  surface into curve slope, where anything below the zero plane is an
  inversion. The spread views switch to a diverging colour scale so the sign
  change is visible.
- **Read a whole day at once.** Move the pointer across the scene and the
  readout gives you every tenor Treasury published that day, the policy rate,
  2s10s and 10y-3m, whatever is on the back wall, and whether the day sits
  inside a recession or a Fed programme. Click to pin it. Escape clears it.
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

### Installing the updater by hand

If the Actions tab has nothing in it, the `.github` folder didn't upload. Fix
it in the browser: click **Add file** → **Create new file**, type
`.github/workflows/update-data.yml` as the filename, paste in the contents of
that file from this folder, and commit.

---

## Pointing yieldcurve3d.com at it

`docs/CNAME` already contains the domain, so GitHub will pick it up. You need
to point the domain at GitHub from wherever you registered it.

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

Back in the repository, **Settings** → **Pages** should now show
`yieldcurve3d.com` under Custom domain. Once the DNS has propagated — usually
minutes, occasionally a day — tick **Enforce HTTPS**. GitHub issues the
certificate free.

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

The result is checked for artefacts: across roughly 440,000 grid points there
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
  lightness, they never fight the QE bands for colour.
- **QE and QT programmes** are coloured bands across the floor, blue for
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
auction cleared at 5.61 per cent and the eight-week at 4.68: twice the loan
for a point less.

---

## Changing things

**Add a period to the buttons.** Open `pipeline/build_data.py`, find the
`PRESETS` list, add a line in the same shape as the others, and re-run the
script. Same for `REGIMES`, which draws the coloured bands on the floor, and
`EVENTS`, which places the markers.

**Change the light or dark palette.** `docs/js/theme.js`. Every colour the page
and the 3D scene use is defined there once, in one object per theme.

**Change the colours.** `docs/js/colormap.js`, the `STOPS` list at the top.

**Change the page's look.** `docs/style.css`. The colours are all defined at
the very top.

**Change how wide or deep the box is.** `BOX` at the top of `docs/js/scene.js`.

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

## Costs

Nothing. GitHub Pages is free for public repositories, and Actions minutes are
free too. A domain name is optional.

## Disclaimer

Shown on the site itself, and repeated here:

> **About the data.** This is an educational visualisation of US Treasury yield
> data. While we try to present the data accurately, errors, delays, missing
> data or visualisation artefacts may occur. Always verify important
> information with the original data source.
>
> **For educational and informational purposes only. Not investment advice.**
> No warranty of any kind is given, express or implied, as to accuracy,
> completeness or fitness for any purpose.

## Licence

The code here is MIT licensed — see `LICENSE`. It is original work; it is not
derived from any other visualisation. three.js is bundled under its own MIT
licence (`docs/vendor/THREE-LICENSE.txt`), which requires that the licence file
stays with it.
