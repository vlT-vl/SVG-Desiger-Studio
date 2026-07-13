// Shared low-level SVG/XML tag scanner used across highlight.js (syntax
// coloring), elementLocator.js (bidirectional selection), merge.js (root/insert
// point detection) and optimize.js (whitespace-preserve regions) — one correct
// implementation instead of several divergent regex passes.

// Finds the end of a tag starting at `code[i]` ('<'), returning the index right
// after the closing '>'. Two passes handle malformed SVG (merged/converted files
// often carry stray unescaped quotes or unclosed tags):
//   1. strict — tracks quote state, bails on an unescaped '<' (nested/unclosed tag)
//   2. lenient — ignores quote state, accepts the first '>' before the next '<'
// Returns -1 when neither pass finds a real tag end, so the caller can fall back
// to treating '<' as plain text instead of swallowing the rest of the document.
export function findTagEnd(code, i) {
  let j = i + 1, q = null;
  while (j < code.length) {
    const c = code[j];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '<') break;
    else if (c === '>') return j + 1;
    j++;
  }

  let k = i + 1;
  while (k < code.length && code[k] !== '<') {
    if (code[k] === '>') return k + 1;
    k++;
  }

  return -1;
}

// Single stack-based pass over the whole source producing a flat, document-order
// array of element descriptors: { tagName, start, openEnd, closeStart, closeEnd,
// end, selfClosing, parentIndex, childIndices }. Comments/CDATA/PI/DOCTYPE are
// skipped as opaque spans and never tokenized as tags (mirrors highlightSvg's
// existing treatment). Closing tags pop the stack by matching tagName from the
// top down (LIFO), so nested same-tag elements always match correctly by
// construction — a `</g>` can only ever close the innermost open `g`. Unclosed
// tags at EOF are force-closed there rather than left with `end: null`, and a
// stray/unmatched closing tag is simply ignored (lenient, matches the rest of
// this codebase's malformed-input recovery philosophy).
export function scanElements(code) {
  const nodes = [];
  const stack = [];
  const n = code.length;
  let i = 0;

  while (i < n) {
    if (code.startsWith("<!--", i)) {
      const end = code.indexOf("-->", i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (code.startsWith("<![CDATA[", i)) {
      const end = code.indexOf("]]>", i + 9);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (code.startsWith("<?", i)) {
      const end = code.indexOf("?>", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (code.startsWith("<!", i)) {
      const end = code.indexOf(">", i + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }

    if (code[i] === "<" && code[i + 1] === "/") {
      const gt = code.indexOf(">", i);
      const closeEnd = gt < 0 ? n : gt + 1;
      const nameM = code.slice(i + 2, gt < 0 ? n : gt).match(/^\s*([a-zA-Z][\w:.-]*)/);
      const closeName = nameM ? nameM[1].toLowerCase() : null;

      let matchIdx = -1;
      for (let s = stack.length - 1; s >= 0; s--) {
        if (nodes[stack[s]].tagName === closeName) { matchIdx = s; break; }
      }
      if (matchIdx >= 0) {
        while (stack.length > matchIdx) {
          const idx = stack.pop();
          const atMatch = stack.length === matchIdx;
          nodes[idx].closeStart = atMatch ? i : nodes[idx].openEnd;
          nodes[idx].closeEnd   = atMatch ? closeEnd : nodes[idx].openEnd;
          nodes[idx].end        = nodes[idx].closeEnd;
        }
      }
      i = closeEnd;
      continue;
    }

    if (code[i] === "<") {
      const tagEnd = findTagEnd(code, i);
      if (tagEnd < 0) { i++; continue; }

      const raw = code.slice(i, tagEnd);
      const nameM = raw.match(/^<([a-zA-Z][\w:.-]*)/);
      if (!nameM) { i = tagEnd; continue; }

      const tagName = nameM[1].toLowerCase();
      const selfClosing = /\/\s*>$/.test(raw);
      const parentIdx = stack.length ? stack[stack.length - 1] : -1;
      const idx = nodes.length;
      nodes.push({
        tagName,
        start: i,
        openEnd: tagEnd,
        closeStart: selfClosing ? tagEnd : null,
        closeEnd: selfClosing ? tagEnd : null,
        end: selfClosing ? tagEnd : null,
        selfClosing,
        parentIndex: parentIdx,
        childIndices: [],
      });
      if (parentIdx >= 0) nodes[parentIdx].childIndices.push(idx);
      if (!selfClosing) stack.push(idx);
      i = tagEnd;
      continue;
    }

    i++;
  }

  while (stack.length) {
    const idx = stack.pop();
    nodes[idx].closeStart = nodes[idx].closeEnd = nodes[idx].end = n;
  }

  return nodes;
}
