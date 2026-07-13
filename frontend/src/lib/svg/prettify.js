import { normalizeSvgAttr } from "./attrs.js";
import { parseSvgLenient } from "./parseSvg.js";

const PRESERVE_TAGS = new Set(["style", "script"]);

function escapeAttr(val) {
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeText(val) {
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serializeNode(node, depth = 0) {
  const pad = "  ".repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const trimmed = node.textContent.trim();
    if (!trimmed) return "";
    return trimmed
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => `${pad}${escapeText(l)}\n`)
      .join("");
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    const val = node.nodeValue ?? "";
    const lines = val.split("\n");
    if (lines.length === 1) return `${pad}<!--${val}-->\n`;
    const inner = lines.map((l, i) => (i === 0 ? l : `${pad}  ${l.trim()}`)).join("\n");
    return `${pad}<!--${inner}-->\n`;
  }

  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return `${pad}<![CDATA[${node.nodeValue ?? ""}]]>\n`;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName;
  const attrStr = Array.from(node.attributes)
    .map(a => `${a.name}="${escapeAttr(normalizeSvgAttr(a.name, a.value))}"`)
    .join(" ");
  const open = attrStr ? ` ${attrStr}` : "";

  // <style> / <script>: preserve text verbatim, just re-indent
  if (PRESERVE_TAGS.has(tag.toLowerCase())) {
    const text = node.textContent.trim();
    if (!text) return `${pad}<${tag}${open}/>\n`;
    const childPad = "  ".repeat(depth + 1);
    const indented = text
      .split("\n")
      .map(l => `${childPad}${l.trimStart()}`)
      .join("\n");
    return `${pad}<${tag}${open}>\n${indented}\n${pad}</${tag}>\n`;
  }

  const children = Array.from(node.childNodes)
    .map(c => serializeNode(c, depth + 1))
    .join("");

  if (!children.trim()) {
    return `${pad}<${tag}${open}/>\n`;
  }

  return `${pad}<${tag}${open}>\n${children}${pad}</${tag}>\n`;
}

// Comments that sit outside the <svg> root (e.g. a leading "Generator: Adobe
// Illustrator ..." comment, very common in exported files) are siblings of the
// root element at the container level, not descendants of it — serializeNode(svgEl)
// alone never sees them. Walk the container's children around the root and keep
// any comment nodes so prettify never silently drops them.
function serializeOuterComments(container, svgEl) {
  if (!container) return { before: "", after: "" };
  let before = "";
  let after = "";
  let seenRoot = false;
  Array.from(container.childNodes).forEach((n) => {
    if (n === svgEl) { seenRoot = true; return; }
    if (n.nodeType !== Node.COMMENT_NODE) return;
    if (seenRoot) after += serializeNode(n, 0);
    else before += serializeNode(n, 0);
  });
  return { before, after };
}

export function prettify(svgString) {
  if (!svgString?.trim()) return svgString;
  try {
    const trimmed = svgString.trim();
    const { svgEl, container } = parseSvgLenient(trimmed);
    if (!svgEl) return svgString;

    const { before, after } = serializeOuterComments(container, svgEl);
    const result = (before + serializeNode(svgEl, 0) + after).trimEnd();
    return result || svgString;
  } catch {
    return svgString;
  }
}
