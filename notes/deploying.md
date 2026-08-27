# Deploying and maintaining the site

Working notes, kept out of the README because they are instructions to myself
rather than documentation of the project. Nothing here is needed to understand
the site or check the data.

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

## Local development

`python3 pipeline/serve.py` serves `docs/` with caching disabled. The built-in
`http.server` lets the browser hold on to JavaScript modules, which means an
edit is silently ignored and you end up drawing conclusions from code that is
no longer running.

## Costs

Nothing. GitHub Pages is free for public repositories, and Actions minutes are
free too. A domain name is optional.

## Turning on visit counting

To start counting visits, sign up at [goatcounter.com](https://www.goatcounter.com)
and put the code you choose into the one marked line near the bottom of
`docs/index.html`:

```js
var CODE = "yieldcurve3d";        // was ""
```

With it empty no script is fetched and nothing at all is sent. GoatCounter sets
no cookies and stores no personal data, so no consent banner is required, and
the About panel already says the site uses it.

Three places it deliberately does not run: inside embeds, because a publisher's
readers did not choose to be counted and their traffic would stop the numbers
meaning "visits to the site"; on localhost, so your own development does not
pollute the figures; and in the single-file build, which is meant to work
offline and should not report back when someone passes it around.

Note that GitHub's own **Insights → Traffic** page counts visits to the
*repository*, not to the website. GitHub Pages provides no server logs.
