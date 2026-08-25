# Launch kit — Hacker News and r/dataisbeautiful

Post to Hacker News first, on a Tuesday, Wednesday or Thursday, around
**8–10am US Eastern**. Then r/dataisbeautiful two or three days later. Never
the same day: both need you present in the comments for hours, and the
audiences barely overlap so there is nothing to gain by combining them.

---

## Hacker News

### Title (paste exactly)

```
Show HN: The US Treasury yield curve in 3D, every trading day since 1990
```

Plain and factual. HN punishes adjectives. No "beautiful", no "stunning", no
exclamation marks. The URL field gets `https://yieldcurve3d.com` and the text
field stays **empty** — put your explanation in the first comment instead.

### First comment (post immediately after submitting)

```
I built this after seeing the NYT's 3D yield curve piece from 2015 and
wanting to explore the data myself rather than watch a fixed animation.

It's every daily Treasury par yield curve since 1990 — 9,167 trading days,
14 maturities from one month to thirty years — as a surface you can turn and
scrub through. The Fed funds target runs along the front edge, since it's
effectively the zero-maturity point of the curve.

A few things that turned out to be more interesting than I expected:

The Treasury stopped issuing the 30-year bond between Feb 2002 and Feb 2006,
so there's a four-year hole at the outer edge of the surface. You can't
interpolate across it because there's nothing beyond it, so I interpolate the
30y-minus-20y spread through time and add it back to the published 20-year.
994 days are reconstructed that way and shaded paler. The 1-month rate didn't
exist before Jul 2001 either; there I anchor the short end with the Fed funds
rate, which turns an extrapolation off the end of the curve into an
interpolation between two real numbers.

Height doesn't have to mean the yield. Switch it to "yield minus Fed funds"
and QE becomes visible — on a plain yield surface 2009-2014 looks flat and
dead, because everything is near zero. Measured against the policy rate the
front edge pins at zero and you can watch the long end being dragged toward
it.

Technically it's deliberately boring: no build step, no framework, no npm.
Three.js is vendored, everything else is about 3,900 lines of plain
JavaScript and standard-library Python. The data pipeline caches raw
downloads so finished years are fetched once and never again, and it's
byte-for-byte deterministic so the nightly GitHub Action only commits when
data actually changed. The social preview image is rendered from the data by
a PNG writer built on zlib and struct, because I didn't want a dependency for
one image.

No cookies, no trackers beyond a cookieless page counter. Data is US Treasury
and FRED, both public.

Happy to answer questions about the interpolation or the data plumbing.
```

### What they will push on, and honest answers

**"1.3MB is a lot."** True. 432KB is three.js, 889KB is 36 years of data,
about 38KB is my code, all gzipped. It's cached after the first visit and
there is no server round-trip after load. If someone suggests trimming, agree
— the manifest carries 9,167 date strings that could be packed.

**"Another yield curve chart."** Point at the height modes. Nobody else lets
you re-base the surface against the policy rate, and that is the thing that
makes QE visible.

**"Where's the S&P data from?"** Answer straight: a Yahoo Finance download for
the deep history, spliced to FRED. FRED only carries ten years because S&P Dow
Jones licenses index values. Say it's fine for a non-commercial site and that
NASDAQ and VIX cover the full range if it ever isn't. Don't be defensive; it
is a fair question and the honest answer is a good one.

**"Does it work on mobile?"** Yes — one finger rotates, two pinch, tap reads a
day. Say so plainly.

### Rules that will get you buried

Never ask anyone to upvote, anywhere, including privately. It is the fastest
way to get a post killed and an account penalised. Submit it and leave it
alone. Stay in the thread for three or four hours and answer everything,
including the criticism, without arguing.

---

## r/dataisbeautiful

The important thing: **it is an image subreddit.** A bare link to an
interactive site underperforms badly. Post a picture, put the link in the
comment.

### What to post

A short screen recording beats a still. Fifteen to twenty seconds, no audio:
start on the full 36 years, rotate slowly, then switch the height to "yield
minus Fed funds" over the QE1 range and let the surface transform. That last
move is the whole pitch and it needs no narration.

If you would rather post a still, use the camera button in the corner on the
"Everything" preset in light mode. It exports at 2x with the title, date range,
sources and watermark already on it, which is most of what the subreddit's
rules ask for.

### Title (paste exactly)

```
[OC] Every US Treasury yield curve since 1990, as a single surface
```

The `[OC]` tag is required for original content and the flair must be set to
OC as well.

### Required first comment

The subreddit requires source and tool in a comment. Without it the post gets
removed.

```
Source: US Department of the Treasury daily par yield curve rates, and
FRED (St. Louis Fed) for the Fed funds target and the balance sheet.
Both public domain.

Tools: three.js for the rendering, Python standard library for the data
pipeline. No plotting library — the surface is a mesh built from the
9,167 daily curves.

Interactive version, if you want to scrub through it yourself:
https://yieldcurve3d.com
```

### Timing and expectations

Post between **9am and noon US Eastern**, weekdays. That subreddit is much
larger than Hacker News but the traffic is shallower — people upvote the
picture and scroll on. Expect a big impression count and a much smaller
click-through than HN.

Do not cross-post the same image to r/economics or r/investing on the same
day. Both dislike anything that looks like a campaign. Leave it a week, and
lead with a specific finding rather than the tool — the May 2023 debt ceiling
episode is the strongest candidate.
