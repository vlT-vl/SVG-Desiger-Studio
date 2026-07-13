// Shared lenient SVG/XML parse chain, extracted from prettify.js so
// optimize.js can reuse the same tolerance instead of hard-failing on any
// parse error. Three tiers, in order:
//   1. strict — SVG/XML parse as-is
//   2. fixed  — repair unescaped bare '&' then re-parse as SVG/XML
//   3. html   — very lenient HTML parse (handles most other malformed markup)
// Returns { svgEl, container } where `container` is the node whose direct
// children may include siblings of the root (e.g. leading/trailing comments,
// an XML declaration) — a Document for the two XML tiers, or `<body>` for the
// HTML fallback tier. `svgEl` is null only if no <svg> could be recovered at all.

// Fix bare & that are not part of a valid entity reference.
export function fixBareAmpersands(str) {
  return str.replace(/&(?!(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]\w*);)/g, "&amp;");
}

export function parseSvgLenient(trimmed) {
  const strictDoc = new DOMParser().parseFromString(trimmed, "image/svg+xml");
  if (!strictDoc.querySelector("parsererror")) {
    return { svgEl: strictDoc.documentElement, container: strictDoc };
  }

  const fixedDoc = new DOMParser().parseFromString(fixBareAmpersands(trimmed), "image/svg+xml");
  if (!fixedDoc.querySelector("parsererror")) {
    return { svgEl: fixedDoc.documentElement, container: fixedDoc };
  }

  const htmlDoc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${trimmed}</body></html>`,
    "text/html"
  );
  return { svgEl: htmlDoc.querySelector("svg"), container: htmlDoc.body };
}
