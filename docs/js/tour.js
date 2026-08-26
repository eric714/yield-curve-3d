/**
 * The first-visit walkthrough.
 *
 * Someone arriving from a link decides in a few seconds whether they
 * understand what they are looking at. This names the three axes and drives
 * the chart while it does it, because showing the surface end-on explains the
 * maturity axis better than any sentence can.
 *
 * It assumes no knowledge of bonds. It runs once, and the question mark in the
 * corner replays it.
 */

const SEEN_KEY = "yc3d-tour-seen";

const STEPS = [
  {
    title: "What you are looking at",
    body: "Governments borrow money by selling bonds. This surface is what it "
        + "cost the United States to borrow, on every trading day. You are "
        + "looking at the last five years; the record goes back to 1990.",
    apply: { preset: "Past five years", view: "default", heightMode: "level" },
  },
  {
    title: "Each ridge is one day",
    body: "Seen end-on, every ridge running left to right is a single day. The "
        + "left edge is borrowing for one month, the right edge for thirty "
        + "years, and the height is the rate. Lending for longer usually pays "
        + "more, so the line climbs to the right.",
    apply: { view: "front" },
  },
  {
    title: "Time runs left to right",
    body: "Turn it square on and the whole history lies across the screen, "
        + "one ridge per trading day, with the maturities receding away from "
        + "you. Drag anywhere on the chart to rotate it, and scroll to zoom.",
    apply: { view: "side" },
  },
  {
    title: "When it slopes the wrong way",
    body: "Sometimes two-year money costs more than ten-year, and the curve "
        + "slopes down to the right instead of up. That is an inversion, and "
        + "it has a reputation as a recession warning. It earned that twice "
        + "here, ahead of 2001 and ahead of 2008. Then the 2022 inversion ran "
        + "more than two years, the longest in the record, and no recession "
        + "followed.",
    apply: { preset: "Inflation shock", view: "front" },
  },
  {
    title: "Read any day you like",
    body: "Move the pointer across the surface, or tap it on a phone, and the "
        + "panel gives you every rate the Treasury published that day. Click "
        + "to pin it there.",
    apply: { preset: "Past five years", view: "default" },
  },
  {
    title: "Height can mean other things",
    body: "Now the height is each maturity measured against the rate the Fed "
        + "was charging that day, so the flat plane is the Fed itself. "
        + "Through 2007 almost the whole surface sits below it: the bond "
        + "market was betting on cuts months before the Fed made any. On 10 "
        + "September the two-year sat 1.38 points under the policy rate. "
        + "Eight days later the Fed cut.",
    apply: { preset: "Global financial crisis", view: "default",
             heightMode: "vsFunds", show: { showFedFunds: true } },
    spotlight: "#height-block",
  },
  {
    title: "Something behind the surface",
    body: "The back wall carries a second series for context. Here it is the "
        + "Federal Reserve's balance sheet, climbing as it bought bonds. You "
        + "can swap it for the S&P 500, the NASDAQ, the VIX, the ten-year "
        + "term premium, expected inflation, the growth rate of the money "
        + "supply, or the unemployment rate. It starts empty, so nothing is on "
        + "the wall until you put it there.",
    apply: { preset: "Everything", view: "default", heightMode: "level",
             contextSeries: "WALCL" },
    spotlight: "#wall-block",
  },
  {
    title: "What is marked on it",
    body: "Colored bands on the floor are the Fed's bond-buying and selling "
        + "programs, blue for easing and red for tightening. Recessions fall "
        + "across the surface as shade. Small diamonds mark days when "
        + "something happened; put the cursor on one and the panel tells you "
        + "what.",
    apply: { show: { showRegimes: true, showRecessions: true, showEvents: true } },
    spotlight: "#show-block",
  },
  {
    title: "Inflation, as a sea level",
    body: "A yield is what you are paid; inflation is what it is worth when "
        + "you get it. This sheet floats at the rate consumer prices were "
        + "rising, so anything under it lost money in real terms. In the "
        + "whole of 2022 there was not a single day when any Treasury, out "
        + "to thirty years, paid more than inflation. Put the unemployment "
        + "rate on the back wall and you have both halves of what the Fed is "
        + "told to care about, on screen at once.",
    apply: { preset: "Inflation shock", view: "default", heightMode: "level",
             contextSeries: "UNRATE",
             show: { showInflation: true, showRegimes: false,
                     showRecessions: false, showEvents: false } },
    spotlight: "#show-block",
  },
  {
    title: "Choose the maturities",
    body: "Switch any of them off and the curve is redrawn through the ones "
        + "left, so the surface stays continuous instead of developing holes. "
        + "Useful for looking only at the short end, where the Fed acts.",
    spotlight: "#maturities-block",
  },
  {
    title: "Now go and look",
    body: "These buttons jump to the famous episodes: try the global financial "
        + "crisis. Drag either end of the date slider to change the range, or "
        + "the bar between them to move the whole window through history.",
    apply: { preset: "Past five years", view: "default", heightMode: "level",
             contextSeries: "none",
             show: { showRegimes: false, showRecessions: false,
                     showEvents: false, showFedFunds: false,
                     showLines: false, showInflation: false } },
    spotlight: "#presets",
  },
];

export class Tour {
  constructor(host, api) {
    this.host = host;
    this.api = api;
    this.index = -1;
    this.card = null;
  }

  /** True the first time anyone opens the site in this browser. */
  static unseen() {
    try {
      return !localStorage.getItem(SEEN_KEY);
    } catch (err) {
      return false;     // private browsing: do not nag on every page load
    }
  }

  static remember() {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (err) { /* no-op */ }
  }

  start() {
    if (this.card) this.stop();
    this.index = 0;
    this.build();
    this.render();
    this.onKey = (ev) => {
      if (ev.key === "Escape") this.stop();
      else if (ev.key === "ArrowRight" || ev.key === "Enter") this.next();
      else if (ev.key === "ArrowLeft") this.back();
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", this.onKey);
  }

  build() {
    this.card = document.createElement("div");
    this.card.id = "tour";
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-label", "How to read this chart");
    this.host.appendChild(this.card);
    this.card.addEventListener("click", (ev) => {
      const act = ev.target.closest("[data-tour]")?.dataset.tour;
      if (act === "next") this.next();
      else if (act === "back") this.back();
      else if (act === "skip") this.stop();
    });
  }

  render() {
    const step = STEPS[this.index];
    this.clearSpotlight();

    if (step.apply) this.api.apply(step.apply);
    if (step.spotlight) {
      const el = document.querySelector(step.spotlight);
      if (el) {
        el.classList.add("tour-spot");
        this.spotted = el;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    const last = this.index === STEPS.length - 1;
    const dots = STEPS.map((_, i) =>
      `<span class="${i === this.index ? "on" : ""}"></span>`).join("");

    this.card.innerHTML = `
      <div class="tour-head">
        <b>${step.title}</b>
        <button data-tour="skip" aria-label="Close the walkthrough">&times;</button>
      </div>
      <p>${step.body}</p>
      <div class="tour-foot">
        <div class="tour-dots">${dots}</div>
        <div class="tour-btns">
          ${this.index > 0 ? '<button data-tour="back" class="ghost">Back</button>' : ""}
          <button data-tour="next" class="go">${last ? "Start exploring" : "Next"}</button>
        </div>
      </div>`;
  }

  next() {
    if (this.index >= STEPS.length - 1) return this.stop();
    this.index++;
    this.render();
  }

  back() {
    if (this.index <= 0) return;
    this.index--;
    this.render();
  }

  clearSpotlight() {
    if (this.spotted) this.spotted.classList.remove("tour-spot");
    this.spotted = null;
  }

  stop() {
    this.clearSpotlight();
    if (this.card) { this.card.remove(); this.card = null; }
    if (this.onKey) window.removeEventListener("keydown", this.onKey);
    Tour.remember();
  }
}
