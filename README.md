# The Shape of Money

An interactive 3D view of every US Treasury yield curve since 1990, with the
Fed funds target rate along the front edge and the Federal Reserve's balance
sheet on the back wall.

It runs entirely in the browser. Visitors need nothing installed. Hosting costs
nothing.

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

## Using a domain name

Buy one anywhere (roughly $12 a year). Then in **Settings** → **Pages** →
"Custom domain", type it in and save. GitHub tells you which DNS records to
add at your registrar. Tick **Enforce HTTPS** once it offers to.

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
the balance sheet (`WALCL`), and three market series. These are only
re-downloaded when the local copy is more than a few days stale. No API key is
needed.

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

---

## Changing things

**Add a period to the buttons.** Open `pipeline/build_data.py`, find the
`PRESETS` list, add a line in the same shape as the others, and re-run the
script. Same for `REGIMES`, which draws the coloured bands on the floor.

**Change the colours.** `docs/js/colormap.js`, the `STOPS` list at the top.

**Change the page's look.** `docs/style.css`. The colours are all defined at
the very top.

**Change how wide or deep the box is.** `BOX` at the top of `docs/js/scene.js`.

---

## About the S&P 500

S&P 500 index values belong to S&P Dow Jones Indices. The free feed only goes
back ten years, which is why it's offered as one option among several rather
than the default. The NASDAQ Composite reaches back to 1971 and the VIX starts
on 2 January 1990 — the very same day the Treasury's daily curve does.

Treasury and Federal Reserve data are US government works and carry no
copyright.

---

## Costs

Nothing. GitHub Pages is free for public repositories, and Actions minutes are
free too. A domain name is optional.

## Licence

The code here is MIT licensed — see `LICENSE`. It is original work; it is not
derived from any other visualisation. three.js is bundled under its own MIT
licence (`docs/vendor/THREE-LICENSE.txt`), which requires that the licence file
stays with it.
