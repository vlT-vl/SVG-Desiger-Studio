// Drag & drop SVG merge: extracts a dropped file's root content/coordinate
// system, and splices it into the base document as a single, safe, predictable
// strategy — always a coordinate-preserving nested <svg> (so the dropped file's
// own viewBox/width/height keep working regardless of the base canvas's own
// coordinate system), positioned/scaled via a wrapping <g transform>.

import { scanElements } from "./tagScanner.js";
import { appendEdit } from "./elementLocator.js";

function indent(str, spaces = 2) {
  const pad = " ".repeat(spaces);
  return str.split("\n").map((l) => pad + l).join("\n");
}

// Locates the dropped SVG's root tag (tolerant of leading comments/XML
// declarations, since scanElements already treats those as opaque and skips
// them) and returns its inner markup plus its own viewBox/width/height, so the
// caller can give the merged copy an independent coordinate system.
export function extractSvgInner(svg) {
  const nodes = scanElements(svg);
  const root = nodes.find((n) => n.parentIndex === -1 && n.tagName === "svg");
  if (!root || root.selfClosing || root.closeStart == null) return null;

  const openTag = svg.slice(root.start, root.openEnd);
  const viewBoxM = openTag.match(/\bviewBox\s*=\s*(["'])([\s\S]*?)\1/i);
  const widthM   = openTag.match(/\bwidth\s*=\s*(["'])([\s\S]*?)\1/i);
  const heightM  = openTag.match(/\bheight\s*=\s*(["'])([\s\S]*?)\1/i);

  return {
    inner:   svg.slice(root.openEnd, root.closeStart).trim(),
    viewBox: viewBoxM?.[2] ?? null,
    width:   widthM?.[2] ?? null,
    height:  heightM?.[2] ?? null,
  };
}

const ID_ATTR_RE   = /\bid\s*=\s*(["'])([^"']+)\1/gi;
const URL_REF_RE   = /\burl\(\s*(["']?)#([^"')]+)\1\s*\)/gi;
const HREF_ATTR_RE = /\b(?:xlink:)?href\s*=\s*(["'])#([^"']+)\1/gi;

function collectIds(fragment) {
  const ids = new Set();
  let m;
  ID_ATTR_RE.lastIndex = 0;
  while ((m = ID_ATTR_RE.exec(fragment))) ids.add(m[2]);
  return ids;
}

// Deterministic, narrowly-targeted id-collision fix: only ever rewrites the
// three specific reference syntaxes below (id=, url(#id), href="#id") — never
// a blind global string replace, so an unrelated color literal like
// fill="#ff0000" or ordinary text is never touched. Same base + same dropped
// fragment always produces the same renamed ids (no randomness).
export function rewriteCollidingIds(base, dropInner) {
  const baseIds = collectIds(base);
  const dropIds = collectIds(dropInner);
  const rename = new Map();
  let n = 1;
  for (const id of dropIds) {
    if (!baseIds.has(id)) continue;
    let candidate = `merged-${n}-${id}`;
    while (baseIds.has(candidate) || [...rename.values()].includes(candidate)) {
      n++;
      candidate = `merged-${n}-${id}`;
    }
    rename.set(id, candidate);
    n++;
  }
  if (!rename.size) return dropInner;

  return dropInner
    .replace(ID_ATTR_RE, (full, q, id) => (rename.has(id) ? `id=${q}${rename.get(id)}${q}` : full))
    .replace(URL_REF_RE, (full, q, id) => (rename.has(id) ? `url(${q}#${rename.get(id)}${q})` : full))
    .replace(HREF_ATTR_RE, (full, q, id) => (rename.has(id) ? full.replace(`#${id}`, `#${rename.get(id)}`) : full));
  // Known limitation: bare CSS id-selectors ("#grad1 { ... }" inside an
  // embedded <style>, as opposed to url(#grad1)) are deliberately NOT
  // rewritten — a bare "#" is too ambiguous against hex colors to safely
  // target with a regex.
}

// Splices `content` right before the base document's root closing tag,
// guaranteeing well-formed output in every case (normal root, self-closed
// root, or — degenerate — no parsable root at all). The normal-root case
// reuses appendEdit() — the exact same clean-append primitive the Snippets
// menu uses (see Editor.jsx) — with a manually-built { at, depth: 1 }
// insertion point: a merge always adds a new top-level object in the
// document root, never nested inside whatever container the cursor happens
// to be in, so depth is always 1 regardless of where in the file the editor
// cursor currently sits. appendEdit() trims away any whitespace/blank lines
// already sitting before the root's closing tag and replaces them with
// exactly one newline — so merging never leaves a stray blank line behind,
// same guarantee as every other append action in the editor.
//
// Also why a merge can never land inside a definition container (<defs>,
// <clipPath>, a gradient, ...): `root` here is found by tagName === "svg" at
// the top level specifically, not by descending toward a cursor position
// like findInsertionPoint() does for snippets (elementLocator.js) — a
// definition container is never itself the document's root <svg>, so this
// function structurally can't target one, no explicit check needed.
function insertBeforeRootClose(base, content) {
  const nodes = scanElements(base);
  const root = nodes.find((n) => n.parentIndex === -1 && n.tagName === "svg");

  if (root && !root.selfClosing && root.closeStart != null) {
    const block = indent(content, 2);
    const edit = appendEdit(base, { at: root.closeStart, depth: 1 }, block);
    return base.slice(0, edit.start) + edit.text + base.slice(edit.end);
  }
  if (root && root.selfClosing) {
    const openTag = base.slice(root.start, root.openEnd).replace(/\s*\/\s*>\s*$/, ">");
    return base.slice(0, root.start) + openTag + "\n" + content + "\n</svg>" + base.slice(root.openEnd);
  }
  return `<svg>\n${base}\n${content}\n</svg>`;
}

export function applyMerge(base, drop, tx, ty, scale) {
  const { inner, viewBox, width, height, name } = drop;
  const rewrittenInner = rewriteCollidingIds(base, inner);
  const comment = name ? `<!-- merged: ${name} -->\n` : "";
  const nestedAttrs = [
    viewBox ? ` viewBox="${viewBox}"` : "",
    width   ? ` width="${width}"`     : "",
    height  ? ` height="${height}"`   : "",
  ].join("");
  const content = `${comment}<g transform="translate(${tx}, ${ty}) scale(${scale})">\n  <svg${nestedAttrs}>\n${indent(rewrittenInner, 4)}\n  </svg>\n</g>`;
  return insertBeforeRootClose(base, content);
}
