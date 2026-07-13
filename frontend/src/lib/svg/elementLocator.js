// Locates full SVG element ranges in the raw source string, both directions:
// Preview click ({ tagName, count }) -> full source range for the editor, and
// editor cursor/selection -> the structural { tagName, count } for Preview.
// { tagName, count } (document-order occurrence index) is the shared currency
// between "where's the cursor" and "which DOM node is this" — a flat count is
// already unambiguous for nested same-tag structures, since document order is a
// single, total order shared identically by querySelectorAll (DOM side) and
// scanElements (source side).

import { scanElements } from "./tagScanner.js";

// SVG elements that never render visible content directly — definitions,
// metadata, and filter-primitive plumbing. Shared by Preview.jsx (deciding
// which DOM node a highlight box should actually wrap) and findInsertionPoint()
// below (deciding where a brand-new snippet/merge is allowed to land) — same
// underlying question ("is this a real place for visible content, or just a
// template/definition?"), so one canonical list instead of two that could
// silently drift apart.
export const NON_RENDERING_TAGS = new Set([
  "defs",
  "lineargradient",
  "radialgradient",
  "filter",
  "clippath",
  "mask",
  "marker",
  "pattern",
  "symbol",
  "style",
  "script",
  "metadata",
  "title",
  "desc",
  "fegaussianblur",
  "feoffset",
  "feblend",
  "fecolormatrix",
  "fecomponenttransfer",
  "fecomposite",
  "feconvolvematrix",
  "fediffuselighting",
  "fedisplacementmap",
  "fedistantlight",
  "fedropshadow",
  "feflood",
  "fefunca",
  "fefuncb",
  "fefuncg",
  "fefuncr",
  "feimage",
  "femerge",
  "femergenode",
  "femorphology",
  "fepointlight",
  "fespecularlighting",
  "fespotlight",
  "fetile",
  "feturbulence",
]);

// Finds the `count`-th (0-based, document order) element named `tagName` and
// returns its FULL range: { start, end } spanning the opening tag through the
// matching closing tag (including all nested children), or the whole
// self-closing tag. Used to select the entire component in the editor, not
// just its opening tag.
export function resolveElementRange(code, tagName, count) {
  const nodes = scanElements(code);
  const target = nodes.filter((n) => n.tagName === tagName)[count];
  return target ? { start: target.start, end: target.end } : null;
}

// Given an editor cursor position (or a selection range, possibly backward),
// finds the innermost structural SVG element that contains it and returns its
// { tagName, count } identity for Preview. Deterministic rules:
//   - cursor inside a leaf's own tag or content -> that leaf
//   - cursor between two children of a container -> the container itself
//     (no child's range covers a gap between siblings, so the walk stops one
//     level up, at the innermost element that structurally encloses it)
//   - cursor is only inside the document root's own bounds -> no selection
//     (the root <svg> itself is NEVER a valid result)
export function findElementAtSelection(code, start, end = start) {
  if (start == null) return null;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const nodes = scanElements(code);

  const within = (n) => n.start <= lo && hi <= n.end;

  function descend(indices) {
    for (const idx of indices) {
      const node = nodes[idx];
      if (within(node)) return descend(node.childIndices) ?? node;
    }
    return null;
  }

  const rootIndices = nodes.reduce((acc, n, idx) => {
    if (n.parentIndex === -1) acc.push(idx);
    return acc;
  }, []);

  const hit = descend(rootIndices);
  if (!hit || hit.parentIndex === -1) return null; // never the root <svg>

  const sameTag = nodes.filter((n) => n.tagName === hit.tagName);
  const count = sameTag.indexOf(hit);
  return count < 0 ? null : { tagName: hit.tagName, count };
}

// Finds where a brand-new child element should be appended, preferring the
// cursor's OWN position whenever it's actually safe to insert there:
//   - cursor sits in the gap right before some sibling element (a click
//     landing between two existing shapes, or before the first one) ->
//     insert exactly there, so a snippet added "under a rect in the middle
//     of the file" actually lands next to that rect, not always at the very
//     end of the enclosing container's children.
//   - cursor sits mid-tag/mid-attribute of an existing element, OR anywhere
//     inside a NON_RENDERING_TAGS definition container (<defs>, <clipPath>,
//     <mask>, <pattern>, <symbol>, a gradient, <filter>, ... — at any depth:
//     the walk never enters one, so content nested further down inside it is
//     skipped too), OR trails after the last real child with nothing left to
//     insert "before" -> falls back to appending at the END of the nearest
//     enclosing container that's safe to use (never inside a defs, never
//     splitting an existing tag). In a flat/simple file (all shapes direct
//     children of the root <svg>, no defs involved) this fallback still
//     happens to land at the end of the file, same as before — it's a
//     fallback for genuinely unsafe/ambiguous cursor positions, not the
//     default outcome.
// Returns { at, depth } (insertion offset + nesting depth, for indentation)
// or null if there's no parsable <svg> root at all.
export function findInsertionPoint(code, pos) {
  const nodes = scanElements(code);
  const roots = nodes.filter((n) => n.parentIndex === -1);
  const root = roots.find((n) => n.tagName === "svg") ?? roots[0];
  if (!root) return null;

  const contentContains = (n) => !n.selfClosing && n.openEnd <= pos && pos <= n.closeStart;
  // Strictly excludes n.start on purpose: a cursor sitting exactly AT a
  // child's opening '<' hasn't actually entered its tag yet — that boundary
  // position is "right before this sibling" (safe), not "mid-tag" (unsafe).
  // Without the strict '<' here, pos === child.start would satisfy this AND
  // the "insert right before it" check below, and this one (checked first)
  // would incorrectly win.
  const spanContains = (n) => n.start < pos && pos < n.end;

  function resolve(node) {
    for (const idx of node.childIndices) {
      const child = nodes[idx];

      // At or before this child's start — safe to insert right here,
      // regardless of the child's own kind (definition container or not):
      // nothing of it has been "entered" yet. Snapped to child.start itself
      // rather than the raw cursor offset: the cursor could be anywhere in
      // the whitespace gap before this child (right after the previous
      // sibling, mid-indent, ...), and snapping always produces the same
      // clean result regardless of exactly where in that gap it landed.
      // beforeSibling tells appendEdit() this is a peer insertion (a new
      // sibling pushed in before a REAL following element), not an
      // append-at-container-end — the two need different whitespace
      // handling (see appendEdit).
      if (pos <= child.start) return { at: child.start, container: node, beforeSibling: true };

      if (NON_RENDERING_TAGS.has(child.tagName)) {
        if (spanContains(child)) return { at: node.closeStart, container: node };
        continue;
      }

      if (contentContains(child)) return resolve(child);
      if (spanContains(child)) return { at: node.closeStart, container: node }; // mid-tag of this child — unsafe
    }
    // Nothing left to insert "before" at this level — trailing position,
    // same safe fallback as before (avoids a stray blank line ahead of the
    // container's own closing tag).
    return { at: node.closeStart, container: node };
  }

  // Cursor isn't inside the root's own content (e.g. inside its open tag) —
  // still append at the root's own end as the safest fallback.
  const { at, container, beforeSibling } = contentContains(root)
    ? resolve(root)
    : { at: root.closeStart, container: root };

  let depth = 1;
  for (let p = container.parentIndex; p !== -1; p = nodes[p].parentIndex) depth++;
  return { at, depth, beforeSibling };
}

// Splices `block` right before `insertion.at` (an { at, depth, beforeSibling? }
// pair from findInsertionPoint(), or an equivalent manually-built one — e.g.
// merge.js uses { at: root.closeStart, depth: 1 } to always append at the
// document root regardless of cursor position). Two shapes, because the
// correct whitespace handling differs between them:
//
//   - insertion.beforeSibling (a peer insertion, landing right before a REAL
//     next element rather than at the container's own end): the existing
//     indentation between the PREVIOUS sibling and insertion.at already
//     belongs to — and correctly indents — that next element; touching it
//     would strip its indentation. So this leaves everything before/after
//     insertion.at untouched and just inserts block + a newline + a matching
//     indent (depth, the SAME level as the new block itself, since what
//     follows is a peer, not the container's closing tag).
//
//   - otherwise (append at the end of a container's children, right before
//     its own closing tag): trims any whitespace/blank lines already sitting
//     immediately before the insertion point first, then splices in exactly
//     one newline + block + one newline + closePad (depth-1, matching the
//     container's OWN closing tag's shallower indentation) — so this never
//     leaves a stray/duplicated blank line, regardless of what whitespace
//     happened to already be there.
//
// Returns { start, end, text } for the caller to splice:
// code.slice(0, start) + text + code.slice(end).
export function appendEdit(code, insertion, block) {
  if (insertion.beforeSibling) {
    const pad = "  ".repeat(insertion.depth);
    return {
      start: insertion.at,
      end: insertion.at,
      text: `${block}\n${pad}`,
    };
  }

  let replaceStart = insertion.at;
  while (replaceStart > 0 && /[ \t\n\r]/.test(code[replaceStart - 1])) replaceStart--;

  const closePad = "  ".repeat(Math.max(0, insertion.depth - 1));
  return {
    start: replaceStart,
    end: insertion.at,
    text: `\n${block}\n${closePad}`,
  };
}
