/**
 * Chart snapshots: download, copy, print, and shareable links.
 *
 * The axis labels are HTML sitting on top of the WebGL canvas, so a raw
 * readback of the canvas would come out with no text on it. Everything is
 * recomposited onto a fresh 2D canvas instead: the rendered frame, then the
 * labels at their known positions, then the titling and the watermark.
 */

const SITE = "yieldcurve3d.com";

/**
 * Draw the whole chart, titling included, onto a new canvas.
 * `scale` of 2 gives a crisp image for retina screens and for print.
 */
export function compose({ stage, theme, title, subtitle, footer, scale = 2 }) {
  // preserveDrawingBuffer keeps the last frame readable, but render once more
  // so the image always matches what is on screen right now.
  stage.render(stage.lastExtraLabels || []);

  const src = stage.canvas;
  const w = src.clientWidth, h = src.clientHeight;
  const pad = 22;
  const headroom = 62;
  const footroom = 44;

  const out = document.createElement("canvas");
  out.width = Math.round(w * scale);
  out.height = Math.round((h + headroom + footroom) * scale);
  const ctx = out.getContext("2d");
  ctx.scale(scale, scale);

  const ink = theme.css["--ink"];
  const dim = theme.css["--ink-dim"];
  const faint = theme.css["--ink-faint"];

  ctx.fillStyle = theme.css["--bg"];
  ctx.fillRect(0, 0, w, h + headroom + footroom);

  // Titling above the chart rather than over it, so nothing is obscured.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = `600 21px ${FONT}`;
  ctx.fillText(title, pad, 32);
  ctx.fillStyle = dim;
  ctx.font = `13px ${FONT}`;
  ctx.fillText(subtitle, pad, 51);

  ctx.drawImage(src, 0, headroom, w, h);

  // The axis labels, from the positions the stage projected this frame.
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const label of stage.placed || []) {
    const isTitle = label.cls.includes("axis-title");
    const isEra = label.cls.includes("era");
    ctx.font = isTitle ? `10.5px ${FONT}` : isEra ? `11px ${FONT}` : `11px ${MONO}`;
    ctx.fillStyle = isEra ? dim : faint;
    ctx.fillText(label.text, label.x, label.y + headroom);
  }

  // Footer: sources on the left, the site on the right.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = faint;
  ctx.fillText(footer, pad, h + headroom + footroom / 2);

  ctx.textAlign = "right";
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = dim;
  ctx.fillText(SITE, w - pad, h + headroom + footroom / 2);

  return out;
}

const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace';

const toBlob = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image"))),
      "image/png"));

export async function download(canvas, filename) {
  const blob = await toBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "Image downloaded";
}

export async function copyImage(canvas) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("This browser cannot copy images. Use Download instead.");
  }
  const blob = await toBlob(canvas);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  return "Image copied";
}

export async function openInNewTab(canvas) {
  const blob = await toBlob(canvas);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) throw new Error("The browser blocked the new tab");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "Opened in a new tab";
}

export async function copyLink(url) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
  } else {
    const field = document.createElement("textarea");
    field.value = url;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
  return "Link copied";
}

/**
 * Print by handing the browser a finished image rather than trying to make a
 * live WebGL canvas survive the print pipeline, which it generally will not.
 */
export async function print(canvas, host) {
  const blob = await toBlob(canvas);
  const url = URL.createObjectURL(blob);
  host.innerHTML = "";
  const img = new Image();
  img.src = url;
  host.appendChild(img);
  await img.decode().catch(() => {});
  const done = () => {
    window.removeEventListener("afterprint", done);
    host.innerHTML = "";
    URL.revokeObjectURL(url);
  };
  window.addEventListener("afterprint", done);
  window.print();
  return "Sent to the printer";
}

/** Share the current view as a link. X will unfurl it into a card. */
export function shareOnX(url, text) {
  const target = new URL("https://twitter.com/intent/tweet");
  target.searchParams.set("text", text);
  target.searchParams.set("url", url);
  window.open(target.toString(), "_blank", "noopener,width=600,height=460");
  return "Opening X";
}
