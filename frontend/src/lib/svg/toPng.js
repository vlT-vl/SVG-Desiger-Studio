/**
 * SVG → PNG converter using canvas.
 *
 * The exported PNG is always a square `baseSize * scale` pixel canvas: the
 * SVG's own intrinsic aspect-ratio-preserved box is fitted ("contain") into a
 * `baseSize x baseSize` logical box (centered, transparent padding on the
 * unused sides), then the whole box is rasterized at `scale`x density.
 */

import { resolveColorScheme } from "./scheme.js";

const DEFAULT_SVG_SIZE = 300;
const MAX_CANVAS_DIMENSION = 16384; // conservative cross-browser per-axis cap

// An <svg> with only a viewBox and no explicit width/height has no intrinsic
// size of its own — WebKit (this app's webview) can fail to decode it at all
// as an image resource in that state, rather than falling back to the
// viewBox's own aspect ratio the way the spec allows. Every SVG this app
// creates from scratch (the Snippets menu's empty-editor skeleton, Editor.jsx)
// only ever sets viewBox, so this hits every from-scratch document, not just
// unusual ones. Inject explicit pixel width/height (derived from the
// viewBox) on the root <svg> so it always has a concrete size — same fix
// Preview.jsx already applies for its own (different) reason, moved here so
// both the live preview AND the PNG rasterizer share one implementation.
export function ensureIntrinsicSize(svg) {
  const m = svg.match(/<svg\b[^>]*>/i);
  if (!m) return svg;
  const tag = m[0];
  if (/\bwidth\s*=/i.test(tag) && /\bheight\s*=/i.test(tag)) return svg;

  const vb = tag.match(/\bviewBox\s*=\s*"([^"]*)"/i);
  if (!vb) return svg;
  const parts = vb[1].trim().split(/[\s,]+/).map(Number);
  const w = parts[2];
  const h = parts[3];
  if (!w || !h) return svg;

  const newTag = tag.replace(/<svg\b/i, `<svg width="${w}" height="${h}"`);
  return svg.slice(0, m.index) + newTag + svg.slice(m.index + tag.length);
}

// Bare number or explicit px only — percentages/em/rem/vw/vh have no reliable
// pixel meaning here, so callers fall back to viewBox instead of misreading
// e.g. width="100%" as literally 100px.
function parseCssLength(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(-?[\d.]+)(px)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n > 0 ? n : null;
}

function parseIntrinsicSize(svgEl) {
  let w = parseCssLength(svgEl?.getAttribute("width"));
  let h = parseCssLength(svgEl?.getAttribute("height"));
  if (w == null || h == null) {
    const vb = svgEl?.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/);
      const vw = parseFloat(parts[2]);
      const vh = parseFloat(parts[3]);
      if (vw > 0 && vh > 0) { w = vw; h = vh; }
    }
  }
  if (!w || !h) { w = DEFAULT_SVG_SIZE; h = DEFAULT_SVG_SIZE; }
  return { width: w, height: h };
}

export function toPng(svgString, scale = 3, baseSize = 128, scheme = null) {
  return new Promise((resolve, reject) => {
    if (!svgString?.trim()) {
      return reject(new Error("Empty SVG"));
    }

    try {
      const resolvedSvg = ensureIntrinsicSize(resolveColorScheme(svgString.trim(), scheme));
      const doc = new DOMParser().parseFromString(resolvedSvg, "image/svg+xml");
      if (doc.querySelector("parsererror")) return reject(new Error("SVG parse error"));

      const { width: w, height: h } = parseIntrinsicSize(doc.documentElement);

      const canvasSize = Math.round(baseSize * scale);
      if (canvasSize > MAX_CANVAS_DIMENSION) {
        return reject(new Error(
          `Requested PNG size (${canvasSize}×${canvasSize}px) exceeds the maximum supported canvas size (${MAX_CANVAS_DIMENSION}px). Choose a smaller base size or scale.`
        ));
      }

      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = canvasSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not create a 2D drawing context for this canvas size."));

      // object-fit: contain into the baseSize logical box, then scale the
      // whole box up by the density multiplier — never stretches the SVG.
      const fit = Math.min(baseSize / w, baseSize / h);
      const drawW = w * fit * scale;
      const drawH = h * fit * scale;
      const offsetX = (canvasSize - drawW) / 2;
      const offsetY = (canvasSize - drawH) / 2;

      // No ";charset=utf-8" here on purpose: this WebKit webview's image-type
      // sniffing for a blob: URL used as an <img src> can fail to recognize
      // it as a loadable image at all when the MIME type carries an extra
      // parameter, firing onerror ("Failed to load SVG as image") even for a
      // perfectly well-formed SVG. The blob used elsewhere for the plain
      // "Save SVG" download (OutputPanel.jsx) already uses the bare
      // "image/svg+xml" — matched here for the same reason, not just style.
      const blob = new Blob([resolvedSvg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
        URL.revokeObjectURL(url);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) resolve(pngBlob);
          else reject(new Error("Canvas toBlob failed"));
        }, "image/png");
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load SVG as image"));
      };

      img.src = url;
    } catch (e) {
      reject(e);
    }
  });
}

export function toPngUrl(svgString, scale = 3, baseSize = 128, scheme = null) {
  return toPng(svgString, scale, baseSize, scheme).then((blob) => URL.createObjectURL(blob));
}

export function getSvgDimensions(svgString) {
  try {
    const doc = new DOMParser().parseFromString(svgString?.trim() || "", "image/svg+xml");
    const { width, height } = parseIntrinsicSize(doc.documentElement);
    return { width: Math.round(width), height: Math.round(height) };
  } catch {
    return { width: null, height: null };
  }
}
