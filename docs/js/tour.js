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
        + "cost the United States to borrow, on every trading day since 1990.",
    apply: { preset: "Global financial crisis", view: "default", heightMode: "level" },
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
    title: "Time runs back into the distance",
    body: "Turn it and you see the days stacked one behind another. Drag "
        + "anywhere on the chart to rotate it, and scroll to zoom.",
    apply: { view: "side" },
  },
  {
    title: "When it slopes the wrong way",
    body: "Sometimes two-year money costs more than ten-year, and the surface "
        + "tips backwards. That is an inversion. One came before all four "
        + "recessions shown here, though the long inversion from 2022 was not "
        + "followed by one.",
    apply: { preset: "Inflation shock", view: "front" },
  },
  {
    title: "Read any day you like",
    body: "Move the pointer across the surface, or tap it on a phone, and the "
        + "panel gives you every rate the Treasury published that day. Click "
        + "to pin it there.",
    apply: { preset: "Global financial crisis", view: "default" },
  },
  {
    title: "Now go and look",
    body: "The buttons jump to the famous episodes. Drag either end of the "
        + "date slider to change the range, or the bar between them to move "
        + "the whole window through history.",
    apply: {},
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
      if (el) { el.classList.add("tour-spot"); this.spotted = el; }
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
