/**
 * SVG Optimizer — pure JS, no external deps.
 * Performs SVGO-like passes:
 *  - remove XML declaration
 *  - remove comments
 *  - remove <title>, <desc>, <metadata>
 *  - collapse useless groups <g> with no attrs
 *  - trim whitespace in attribute values
 *  - round floating point numbers to 3 decimal places
 *  - remove empty style/class attributes
 *  - shorten hex colors (#ffffff → #fff)
 *  - remove default attribute values
 */

import { normalizeSvgAttr } from "./attrs.js";
import { parseSvgLenient } from "./parseSvg.js";
import { scanElements } from "./tagScanner.js";

const REMOVABLE_ELEMENTS = new Set(["title", "desc", "metadata"]);

const DEFAULT_ATTRS = {
  fill: "black",
  "fill-opacity": "1",
  "stroke-opacity": "1",
  "stroke-width": "1",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-miterlimit": "4",
  "fill-rule": "nonzero",
  "clip-rule": "nonzero",
  display: "inline",
  visibility: "visible",
  overflow: "visible",
  "font-size": "medium",
  "font-weight": "normal",
  "font-style": "normal",
  "font-stretch": "normal",
  "font-variant": "normal",
  "text-anchor": "start",
  "text-decoration": "none",
  opacity: "1",
  "stop-opacity": "1",
  "flood-opacity": "1",
};

function removeComments(node) {
  const toRemove = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.COMMENT_NODE) toRemove.push(child);
    else removeComments(child);
  });
  toRemove.forEach((n) => n.parentNode.removeChild(n));
}

function removeElements(root, tagNames) {
  tagNames.forEach((tag) => {
    root.querySelectorAll(tag).forEach((el) => el.parentNode?.removeChild(el));
  });
}

function roundAttrValue(value) {
  return value.replace(/(-?\d+\.\d{4,})/g, (match) => {
    const num = parseFloat(match);
    const rounded = Math.round(num * 1000) / 1000;
    return String(rounded);
  });
}

function shortenHex(value) {
  return value.replace(/#([0-9a-fA-F]{6})\b/g, (match, hex) => {
    const r = hex[0] + hex[1];
    const g = hex[2] + hex[3];
    const b = hex[4] + hex[5];
    if (r[0] === r[1] && g[0] === g[1] && b[0] === b[1]) {
      return `#${r[0]}${g[0]}${b[0]}`;
    }
    return match;
  });
}

function processAttributes(el) {
  const toRemove = [];
  Array.from(el.attributes).forEach((attr) => {
    let val = attr.value;

    if (val === "" && (attr.name === "style" || attr.name === "class")) {
      toRemove.push(attr.name);
      return;
    }

    val = normalizeSvgAttr(attr.name, val);
    val = roundAttrValue(val);
    val = shortenHex(val);

    const defaultVal = DEFAULT_ATTRS[attr.name];
    if (defaultVal !== undefined && val === defaultVal) {
      toRemove.push(attr.name);
      return;
    }

    if (attr.value !== val) el.setAttribute(attr.name, val);
  });
  toRemove.forEach((name) => el.removeAttribute(name));
}

function collapseUselessGroups(root) {
  let changed = true;
  while (changed) {
    changed = false;
    root.querySelectorAll("g").forEach((g) => {
      if (g.attributes.length === 0 && g.parentNode) {
        const frag = root.ownerDocument.createDocumentFragment();
        while (g.firstChild) frag.appendChild(g.firstChild);
        g.parentNode.replaceChild(frag, g);
        changed = true;
      }
    });
  }
}

function walkElements(root, fn) {
  const walk = (el) => {
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    fn(el);
    el.childNodes.forEach(walk);
  };
  walk(root);
}

function removeEmptyElements(root) {
  const selfClosingTags = new Set([
    "circle", "ellipse", "line", "path", "polygon",
    "polyline", "rect", "use", "image", "stop",
  ]);
  let changed = true;
  while (changed) {
    changed = false;
    root.querySelectorAll("*").forEach((el) => {
      if (
        el !== root &&
        !selfClosingTags.has(el.tagName.toLowerCase()) &&
        el.childNodes.length === 0 &&
        el.attributes.length === 0 &&
        el.parentNode
      ) {
        el.parentNode.removeChild(el);
        changed = true;
      }
    });
  }
}

// Post-serialization whitespace collapse, but never inside <script>/<style>
// content or an element marked xml:space="preserve" — those need their
// formatting/whitespace kept exactly as authored.
function collapseWhitespaceOutsidePreserved(str) {
  const nodes = scanElements(str);
  const protectedRanges = nodes
    .filter((n) => !n.selfClosing && n.closeStart != null && (
      n.tagName === "script" ||
      n.tagName === "style" ||
      /\bxml:space\s*=\s*(["'])preserve\1/i.test(str.slice(n.start, n.openEnd))
    ))
    .map((n) => [n.openEnd, n.closeStart])
    .sort((a, b) => a[0] - b[0]);

  const collapse = (s) => s.replace(/\s{2,}/g, " ").replace(/>\s+</g, "><").replace(/\s*\/>/g, "/>");

  let out = "";
  let cursor = 0;
  for (const [s, e] of protectedRanges) {
    if (s < cursor) continue; // nested preserved range, already copied verbatim
    out += collapse(str.slice(cursor, s));
    out += str.slice(s, e);
    cursor = e;
  }
  out += collapse(str.slice(cursor));
  return out;
}

export function optimize(svgString) {
  if (!svgString?.trim()) return { result: svgString, savings: 0, savedBytes: 0 };
  const original = svgString.trim();
  const originalBytes = new Blob([original]).size;

  try {
    const { svgEl } = parseSvgLenient(original);
    if (!svgEl) return { result: original, savings: 0, savedBytes: 0 };

    removeComments(svgEl);
    removeElements(svgEl, Array.from(REMOVABLE_ELEMENTS));
    walkElements(svgEl, processAttributes);
    collapseUselessGroups(svgEl);
    removeEmptyElements(svgEl);

    const serializer = new XMLSerializer();
    let result = serializer.serializeToString(svgEl);

    result = collapseWhitespaceOutsidePreserved(result).trim();

    const optimizedBytes = new Blob([result]).size;
    const savedBytes = originalBytes - optimizedBytes;
    const savings = originalBytes > 0 ? Math.round((savedBytes / originalBytes) * 100) : 0;

    return { result, savings, savedBytes, originalBytes, optimizedBytes };
  } catch {
    return { result: original, savings: 0, savedBytes: 0 };
  }
}
